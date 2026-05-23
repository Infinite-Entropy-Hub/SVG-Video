import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

const app = express();

// Set up CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/record', async (req, res) => {
  const { html, duration } = req.body;
  if (!html || !duration) {
    return res.status(400).send('Missing html or duration');
  }

  // Vercel Serverless Functions only allow writing to /tmp
  const outputFilename = `output-${Date.now()}.mp4`;
  const outputPath = process.env.VERCEL ? path.join('/tmp', outputFilename) : path.join(process.cwd(), outputFilename);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set viewport to vertical reel
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    await page.setContent(html, { waitUntil: 'load' });

    // Make sure body expands properly
    await page.evaluate(() => {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      if (!document.body.style.backgroundColor) {
          document.body.style.backgroundColor = '#000000';
      }
    });

    const Config = {
      followNewTab: false,
      fps: 60,
      ffmpeg_Path: ffmpegStatic,
      videoFrame: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
    };

    const recorder = new PuppeteerScreenRecorder(page, Config);
    await recorder.start(outputPath);

    // Wait for the requested duration
    await new Promise(resolve => setTimeout(resolve, duration * 1000));

    await recorder.stop();
    await browser.close();

    res.download(outputPath, 'animation.mp4', (err) => {
      // Cleanup after download
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });

  } catch (error) {
    console.error('Recording error:', error);
    if (browser) await browser.close();
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    res.status(500).send('Error generating video: ' + error.message);
  }
});

// Local Development Server (ignored by Vercel's serverless export)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Local dev server listening on port ${PORT}`);
    });
}

// Export the app for Vercel
export default app;
