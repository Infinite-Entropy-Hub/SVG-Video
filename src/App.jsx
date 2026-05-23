import React, { useState, useRef } from 'react';
import { Download, Code2, Play, Circle, CheckCircle2, FileVideo } from 'lucide-react';

function App() {
  const [svgInput, setSvgInput] = useState('');
  const [duration, setDuration] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const previewRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const startRecording = async () => {
    if (!svgInput.trim()) {
      showToast('Please enter SVG code first');
      return;
    }

    setIsRecording(true);
    setProgress(0);
    setStatusText('Starting...');
    
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

    try {
      const response = await fetch(`${backendUrl}/api/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: svgInput, duration }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));
            
            setProgress(data.progress);
            
            if (data.status === 'launching') setStatusText('Launching renderer...');
            else if (data.status === 'loading') setStatusText('Loading graphics...');
            else if (data.status === 'preparing') setStatusText('Preparing timeline...');
            else if (data.status === 'rendering') setStatusText('Rendering frames...');
            else if (data.status === 'encoding') setStatusText('Encoding MP4 video...');
            else if (data.status === 'done') {
              setStatusText('Done!');
              
              // Open in a new tab instead of forcing immediate download
              window.open(`${backendUrl}${data.downloadUrl}`, '_blank');
              
              setIsRecording(false);
              showToast('Video ready! Opened in new tab.');
              break;
            } else if (data.status === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }
    } catch (err) {
      console.error("Recording failed:", err);
      setIsRecording(false);
      showToast('Failed to generate video. See console for details.');
      setProgress(0);
    }
  };

  return (
    <div className="dashboard-layout">
      <header className="header">
        <div className="header-title">
          <FileVideo size={24} color="var(--accent)" />
          <span>SVG to Video Studio</span>
        </div>
      </header>

      <main className="main-content">
        <div className="panel code-panel">
          <div className="panel-header">
            <div className="panel-header-title">
              <Code2 size={16} />
              <span>SVG Source</span>
            </div>
          </div>
          <div className="code-editor-container">
            <textarea
              className="code-editor"
              value={svgInput}
              onChange={(e) => setSvgInput(e.target.value)}
              placeholder="Paste your 1080x1920 SVG code here..."
              spellCheck="false"
            />
          </div>
        </div>

        <div className="panel preview-panel" style={{ position: 'relative' }}>
          <div className="panel-header">
            <div className="panel-header-title">
              <Play size={16} />
              <span>Live Preview</span>
            </div>
            
            <div className="controls">
              <div className="input-group" style={{ opacity: isRecording ? 0.5 : 1, pointerEvents: isRecording ? 'none' : 'auto' }}>
                <label>Duration (s):</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  disabled={isRecording}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={startRecording}
                disabled={isRecording || !svgInput.trim()}
              >
                {isRecording ? (
                  <span className="recording-indicator">
                    <Circle size={14} fill="currentColor" /> Rendering...
                  </span>
                ) : (
                  <>
                    <Download size={16} /> Generate MP4
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="preview-container">
            {/* PROGRESS OVERLAY - Appears over the preview window while recording */}
            {isRecording && (
              <div className="progress-overlay">
                <div className="progress-container">
                  <div className="progress-header">
                    <span className="progress-title">Generating Video</span>
                    <span className="progress-percentage">{progress}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="progress-text">{statusText}</span>
                </div>
              </div>
            )}

            {svgInput ? (
              <iframe
                ref={previewRef}
                title="SVG Preview"
                className="preview-iframe"
                srcDoc={`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <style>
                        body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; background: #000; }
                        .preview-wrapper { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
                        svg { max-width: 100%; max-height: 100%; object-fit: contain; }
                      </style>
                    </head>
                    <body>
                      <div class="preview-wrapper">${svgInput}</div>
                    </body>
                  </html>
                `}
              />
            ) : (
              <div className="empty-state">
                <Code2 size={48} opacity={0.2} />
                <p>Paste SVG code to see preview</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {toastMessage && (
        <div className="toast">
          <CheckCircle2 className="toast-icon" size={20} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App; 