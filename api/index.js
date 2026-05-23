import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/record', async (req, res) => {
  const { html, duration } = req.body;
  if (!html || !duration) {
    return res.status(400).send('Missing html or duration');
  }

  console.log('\n--- STARTING VIDEO GENERATION (FAST MODE) ---');
  
  const outputFilename = `output-${Date.now()}.mp4`;
  const outputPath = process.env.VERCEL ? path.join('/tmp', outputFilename) : path.join(process.cwd(), outputFilename);
  
  let browser;
  let ffmpegProcess;
  
  // Setup Server-Sent Events (SSE) for streaming progress
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendProgress = (status, progress, downloadUrl = null, error = null) => {
    res.write(`data: ${JSON.stringify({ status, progress, downloadUrl, error })}\n\n`);
  };

  try {
    sendProgress('launching', 5);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=gl'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    sendProgress('loading', 10);
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });

    sendProgress('preparing', 15);
    await page.evaluate(() => {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.display = 'flex';
      document.body.style.justifyContent = 'center';
      document.body.style.alignItems = 'center';
      document.body.style.height = '100vh';
      document.body.style.overflow = 'hidden';
      if (!document.body.style.backgroundColor) {
        document.body.style.backgroundColor = '#000000';
      }

      const el = document.querySelector('.reel-container') || document.body.firstElementChild;
      if (el && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const scaleX = 1080 / rect.width;
          const scaleY = 1920 / rect.height;
          const scale = Math.min(scaleX, scaleY);
          if (scale > 1.01 || scale < 0.99) {
            el.style.transform = `scale(${scale})`;
            el.style.transformOrigin = 'center center';
          }
        }
      }

      document.getAnimations().forEach(anim => anim.pause());
      document.querySelectorAll('svg').forEach(svg => {
        if (svg.pauseAnimations) svg.pauseAnimations();
      });
    });

    const fps = 60;
    const totalFrames = duration * fps;

    ffmpegProcess = spawn(ffmpegStatic, [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', `${fps}`,
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      outputPath
    ]);

    let ffmpegError = '';
    ffmpegProcess.stderr.on('data', (data) => {
      ffmpegError = data.toString(); 
    });

    sendProgress('rendering', 20);
    
    for (let i = 1; i <= totalFrames; i++) {
      const currentTimeMs = (i / fps) * 1000;
      
      await page.evaluate(async (timeMs) => {
        document.getAnimations().forEach(anim => anim.currentTime = timeMs);
        document.querySelectorAll('svg').forEach(svg => {
          if (svg.setCurrentTime) svg.setCurrentTime(timeMs / 1000);
        });
        document.body.offsetHeight; 
        await new Promise(resolve => setTimeout(resolve, 1));
      }, currentTimeMs);

      const frameBuffer = await page.screenshot({ type: 'jpeg', quality: 75 });
      
      const canWrite = ffmpegProcess.stdin.write(frameBuffer);
      if (!canWrite) {
        await new Promise(resolve => ffmpegProcess.stdin.once('drain', resolve));
      }

      if (i % 15 === 0 || i === totalFrames) {
        // Map remaining 80% of progress bar to rendering frames
        const currentProgress = 20 + Math.floor((i / totalFrames) * 75);
        sendProgress('rendering', currentProgress);
      }
    }

    sendProgress('encoding', 95);
    ffmpegProcess.stdin.end();

    await new Promise((resolve, reject) => {
      ffmpegProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}. Error: ${ffmpegError}`));
      });
    });

    await browser.close();

    // Move file to public directory so frontend can download it
    const publicDir = path.join(process.cwd(), 'public', 'outputs');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    
    const finalPublicPath = path.join(publicDir, outputFilename);
    fs.renameSync(outputPath, finalPublicPath);

    sendProgress('done', 100, `/outputs/${outputFilename}`);
    res.end();

  } catch (error) {
    console.error(error);
    if (browser) await browser.close();
    if (ffmpegProcess && !ffmpegProcess.killed) ffmpegProcess.kill();
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    sendProgress('error', 0, null, error.message);
    res.end();
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  // Serve public folder for downloads
  app.use(express.static('public'));
  app.listen(PORT, () => {
    console.log(`Local dev server listening on port ${PORT}`);
  });
}

export default app;