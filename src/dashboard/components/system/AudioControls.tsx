import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAudio } from '../../hooks/useAudio';

// ============================================================================
// Audio Controls - Toggle and volume for sonification
// ============================================================================

export function AudioControls() {
  const { isPlaying, volume, toggleAudio, setVolume } = useAudio();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <div className="audio-controls">
      {/* Main toggle button */}
      <button
        className={`audio-button ${isPlaying ? 'active' : ''}`}
        onClick={toggleAudio}
        onMouseEnter={() => setShowPanel(true)}
        onMouseLeave={() => setShowPanel(false)}
        title={isPlaying ? 'Disattiva audio' : 'Attiva sonificazione'}
      >
        {isPlaying ? (
          <SoundOnIcon />
        ) : (
          <SoundOffIcon />
        )}
        {isPlaying && (
          <motion.div
            className="audio-pulse"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </button>

      {/* Volume panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            className="audio-panel"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            onMouseEnter={() => setShowPanel(true)}
            onMouseLeave={() => setShowPanel(false)}
          >
            <div className="panel-header">
              <span className="panel-icon">🎵</span>
              <span className="panel-title">Sonificazione</span>
            </div>

            <div className="panel-content">
              <p className="panel-description">
                Genesis "suona" il suo stato interno: la coscienza diventa tono,
                i neuromodulatori diventano armonia, il kernel diventa ritmo.
              </p>

              <div className="volume-control">
                <span className="volume-label">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="volume-slider"
                />
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </div>

              <div className="sound-legend">
                <h4>Cosa stai ascoltando:</h4>
                <ul>
                  <li><span className="legend-dot phi"></span> <strong>Drone basso</strong>: livello di coscienza (φ)</li>
                  <li><span className="legend-dot pulse"></span> <strong>Pulsazione</strong>: ciclo del kernel</li>
                  <li><span className="legend-dot ne"></span> <strong>Vibrato</strong>: norepinefrina (attenzione)</li>
                  <li><span className="legend-dot da"></span> <strong>Armonici alti</strong>: dopamina (reward)</li>
                  <li><span className="legend-dot fe"></span> <strong>Dissonanza</strong>: free energy alta</li>
                </ul>
              </div>
            </div>

            <div className="panel-status">
              {isPlaying ? (
                <span className="status-on">● Attivo</span>
              ) : (
                <span className="status-off">○ Disattivo</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .audio-controls {
          position: fixed;
          bottom: 88px;
          right: 24px;
          z-index: 200;
        }

        .audio-button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(10, 10, 18, 0.9);
          border: 2px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          position: relative;
          backdrop-filter: blur(10px);
        }

        .audio-button:hover {
          border-color: rgba(0, 255, 136, 0.5);
          color: rgba(255, 255, 255, 0.8);
        }

        .audio-button.active {
          border-color: #00ff88;
          color: #00ff88;
          background: rgba(0, 255, 136, 0.1);
        }

        .audio-button svg {
          width: 24px;
          height: 24px;
        }

        .audio-pulse {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 2px solid #00ff88;
          pointer-events: none;
        }

        .audio-panel {
          position: absolute;
          bottom: 60px;
          right: 0;
          width: 320px;
          background: rgba(12, 12, 20, 0.98);
          border: 1px solid rgba(0, 255, 136, 0.3);
          border-radius: 16px;
          overflow: hidden;
          backdrop-filter: blur(20px);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-icon {
          font-size: 20px;
        }

        .panel-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
        }

        .panel-content {
          padding: 16px 20px;
        }

        .panel-description {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
          line-height: 1.6;
          margin: 0 0 16px 0;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .volume-label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          min-width: 50px;
        }

        .volume-slider {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          outline: none;
        }

        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #00ff88;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .volume-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .volume-value {
          font-size: 12px;
          color: #00ff88;
          font-family: monospace;
          min-width: 36px;
          text-align: right;
        }

        .sound-legend {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          padding: 12px;
        }

        .sound-legend h4 {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 10px 0;
        }

        .sound-legend ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .sound-legend li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 6px;
        }

        .sound-legend li:last-child {
          margin-bottom: 0;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-dot.phi { background: #00ff88; }
        .legend-dot.pulse { background: #aa66ff; }
        .legend-dot.ne { background: #ffaa00; }
        .legend-dot.da { background: #00ddff; }
        .legend-dot.fe { background: #ff4444; }

        .panel-status {
          padding: 12px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: flex-end;
        }

        .status-on {
          color: #00ff88;
          font-size: 12px;
          font-weight: 500;
        }

        .status-off {
          color: rgba(255, 255, 255, 0.4);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
