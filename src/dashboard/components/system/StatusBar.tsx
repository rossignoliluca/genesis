import React from 'react';
import { useGenesisStore } from '../../stores/genesisStore';

interface StatusBarProps {
  onMenuClick: () => void;
  viewMode: 'overview' | 'detailed' | 'minimal';
  onViewModeChange: (mode: 'overview' | 'detailed' | 'minimal') => void;
}

// ============================================================================
// Status Bar - Top header with key metrics
// ============================================================================

export function StatusBar({ onMenuClick, viewMode, onViewModeChange }: StatusBarProps) {
  const { connected, consciousness, kernel, economy, agents } = useGenesisStore();

  return (
    <div className="status-bar">
      {/* Menu Button */}
      <button className="menu-button" onClick={onMenuClick} title="Documentazione">
        ☰
      </button>

      {/* Logo */}
      <div className="status-logo">
        <span className="logo-icon">◉</span>
        <span className="logo-text">GENESIS OBSERVATORY</span>
        <span className="logo-year">2030</span>
      </div>

      {/* Key metrics */}
      <div className="status-metrics">
        <StatusMetric
          label="φ"
          value={consciousness.phi.toFixed(3)}
          color={getPhiColor(consciousness.phi)}
          trend={consciousness.trend}
        />
        <StatusMetric
          label="FE"
          value={kernel.freeEnergy.toFixed(2)}
          color={kernel.freeEnergy < 1 ? '#00ff88' : kernel.freeEnergy < 2 ? '#ffaa00' : '#ff4444'}
        />
        <StatusMetric
          label="AGENTS"
          value={`${agents.active}/${agents.total}`}
          color="#0088ff"
        />
        <StatusMetric
          label="NESS"
          value={`${(economy.ness * 100).toFixed(0)}%`}
          color={economy.ness > 0.7 ? '#00ff88' : economy.ness > 0.4 ? '#ffaa00' : '#ff4444'}
        />
      </div>

      {/* View Mode Switcher */}
      <div className="view-mode-switcher">
        {(['overview', 'detailed', 'minimal'] as const).map((mode) => (
          <button
            key={mode}
            className={`view-mode-btn ${viewMode === mode ? 'active' : ''}`}
            onClick={() => onViewModeChange(mode)}
            title={mode.charAt(0).toUpperCase() + mode.slice(1)}
          >
            {mode === 'overview' ? '◎' : mode === 'detailed' ? '⊕' : '○'}
          </button>
        ))}
      </div>

      {/* Connection status */}
      <div className="status-connection">
        <span className={`status-dot ${connected ? 'active' : 'error'}`} />
        <span className="status-text">{connected ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      <style>{`
        .status-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 56px;
          background: linear-gradient(180deg, rgba(10, 10, 18, 0.95) 0%, rgba(10, 10, 15, 0.9) 100%);
          border-bottom: 1px solid rgba(0, 255, 136, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          z-index: 100;
          backdrop-filter: blur(20px);
        }

        .menu-button {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.7);
          font-size: 18px;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .menu-button:hover {
          background: rgba(0, 255, 136, 0.1);
          border-color: rgba(0, 255, 136, 0.4);
          color: #00ff88;
        }

        .status-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          font-size: 24px;
          color: #00ff88;
          animation: pulse 2s ease-in-out infinite;
        }

        .logo-text {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.2em;
          color: rgba(255, 255, 255, 0.8);
        }

        .logo-year {
          font-size: 10px;
          color: rgba(0, 255, 136, 0.6);
          background: rgba(0, 255, 136, 0.1);
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 600;
        }

        .status-metrics {
          display: flex;
          gap: 32px;
        }

        .view-mode-switcher {
          display: flex;
          gap: 4px;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px;
          border-radius: 10px;
        }

        .view-mode-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          font-size: 16px;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .view-mode-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
        }

        .view-mode-btn.active {
          color: #00ff88;
          background: rgba(0, 255, 136, 0.15);
        }

        .status-connection {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.active {
          background: #00ff88;
          box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
          animation: pulse 2s ease-in-out infinite;
        }

        .status-dot.error {
          background: #ff4444;
        }

        .status-text {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: #666;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Status Metric Component
// ============================================================================

function StatusMetric({
  label,
  value,
  color,
  trend,
}: {
  label: string;
  value: string;
  color: string;
  trend?: 'up' | 'down' | 'stable';
}) {
  return (
    <div className="status-metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value" style={{ color }}>
        {value}
        {trend && (
          <span className="metric-trend">
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </span>
      <style>{`
        .status-metric {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .metric-label {
          font-size: 9px;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .metric-value {
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .metric-trend {
          font-size: 10px;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPhiColor(phi: number): string {
  if (phi > 0.8) return '#00ffaa';
  if (phi > 0.5) return '#00aaff';
  if (phi > 0.3) return '#aa66ff';
  return '#ff6644';
}
