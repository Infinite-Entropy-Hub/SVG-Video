import React, { useState, useRef, useEffect } from 'react';
import { Download, Code2, Play, Circle, CheckCircle2, FileVideo } from 'lucide-react';

function App() {
  const [svgInput, setSvgInput] = useState(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">
  <circle cx="100" cy="100" r="50" fill="#5e6ad2">
    <animate attributeName="r" values="50; 80; 50" dur="2s" repeatCount="indefinite" />
  </circle>
</svg>`);
  
  const [duration, setDuration] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const previewRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      showToast(`Generating ${duration}s video headlessly. Please wait...`);
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await fetch(`${backendUrl}/api/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html: svgInput, duration }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate video');
      }

      // Convert response to blob
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `animation.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setIsRecording(false);
      showToast(`Video successfully generated and downloaded!`);

    } catch (err) {
      console.error("Recording failed:", err);
      setIsRecording(false);
      showToast('Failed to generate video. See console for details.');
    }
  };

  return (
    <div className="dashboard-layout">
      <header className="header">
        <div className="header-title">
          <FileVideo size={24} color="#5e6ad2" />
          <span>SVG Animator to Video</span>
        </div>
        <div className="controls">
          <div className="input-group">
            <label htmlFor="duration">Duration (s)</label>
            <input 
              type="number" 
              id="duration"
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
            disabled={isRecording}
          >
            {isRecording ? (
              <>
                <Circle size={18} fill="currentColor" className="recording-indicator" />
                Recording...
              </>
            ) : (
              <>
                <Download size={18} />
                Download Video
              </>
            )}
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="panel code-panel">
          <div className="panel-header">
            <div className="panel-header-title">
              <Code2 size={16} />
              SVG Code Input
            </div>
          </div>
          <div className="code-editor-container">
            <textarea
              className="code-editor"
              value={svgInput}
              onChange={(e) => setSvgInput(e.target.value)}
              placeholder="Paste your SVG HTML code here..."
              spellCheck="false"
            />
          </div>
        </div>

        <div className="panel preview-panel" style={isRecording ? { borderColor: '#ef4444', boxShadow: '0 0 0 2px #ef4444' } : {}}>
          <div className="panel-header">
            <div className="panel-header-title">
              <Play size={16} />
              Live Preview
            </div>
            {isRecording && <div className="recording-indicator">● REC</div>}
          </div>
          <div className="preview-container" ref={previewRef}>
            {svgInput ? (
              <iframe 
                className="preview-iframe"
                title="live-preview"
                srcDoc={svgInput}
              />
            ) : (
              <div className="empty-state">
                <FileVideo size={48} opacity={0.5} />
                <p>Paste SVG code to see preview</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {toastMessage && (
        <div className="toast">
          <CheckCircle2 size={20} className="toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
