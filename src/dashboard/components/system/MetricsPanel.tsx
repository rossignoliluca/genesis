import React from 'react';
import { useGenesisStore } from '../../stores/genesisStore';

interface MetricsPanelProps {
  onComponentClick: (component: string) => void;
}

// ============================================================================
// Metrics Panel - Bottom metrics display
// ============================================================================

export function MetricsPanel({ onComponentClick }: MetricsPanelProps) {
  const { kernel, economy, memory, agents } = useGenesisStore();

  return (
    <div className="metrics-panel">
      {/* Free Energy */}
      <MetricCard
        icon="⚡"
        label="FREE ENERGY"
        value={kernel.freeEnergy.toFixed(2)}
        unit=""
        status={kernel.freeEnergy < 1 ? 'good' : kernel.freeEnergy < 2 ? 'warning' : 'error'}
        onClick={() => onComponentClick('kernel')}
      />

      {/* Prediction Error */}
      <MetricCard
        icon="📊"
        label="PRED ERROR"
        value={(kernel.predictionError * 100).toFixed(1)}
        unit="%"
        status={kernel.predictionError < 0.2 ? 'good' : kernel.predictionError < 0.5 ? 'warning' : 'error'}
        onClick={() => onComponentClick('kernel')}
      />

      {/* Memory */}
      <MetricCard
        icon="🧠"
        label="MEMORY"
        value={formatNumber(memory.episodic + memory.semantic + memory.procedural)}
        unit="items"
        status="good"
        onClick={() => onComponentClick('consciousness')}
      />

      {/* Economy */}
      <MetricCard
        icon="💰"
        label="RUNWAY"
        value={economy.runway.toFixed(0)}
        unit="days"
        status={economy.runway > 30 ? 'good' : economy.runway > 7 ? 'warning' : 'error'}
        onClick={() => onComponentClick('economy')}
      />

      {/* MCP */}
      <MetricCard
        icon="🔌"
        label="MCP"
        value={`${agents.providers.length}`}
        unit="providers"
        status="good"
        onClick={() => onComponentClick('neural')}
      />

      {/* Mode */}
      <MetricCard
        icon="⚙️"
        label="MODE"
        value={kernel.mode.toUpperCase()}
        unit=""
        status="neutral"
        onClick={() => onComponentClick('kernel')}
      />

      <style>{`
        .metrics-panel {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 72px;
          background: linear-gradient(0deg, rgba(10, 10, 18, 0.98) 0%, rgba(10, 10, 15, 0.95) 100%);
          border-top: 1px solid rgba(0, 255, 136, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 0 24px;
          z-index: 100;
          backdrop-filter: blur(20px);
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Metric Card Component
// ============================================================================

function MetricCard({
  icon,
  label,
  value,
  unit,
  status,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  status: 'good' | 'warning' | 'error' | 'neutral';
  onClick?: () => void;
}) {
  const statusColor = {
    good: '#00ff88',
    warning: '#ffaa00',
    error: '#ff4444',
    neutral: '#888888',
  }[status];

  return (
    <div className="metric-card" onClick={onClick}>
      <span className="card-icon">{icon}</span>
      <div className="card-content">
        <span className="card-label">{label}</span>
        <span className="card-value" style={{ color: statusColor }}>
          {value}
          {unit && <span className="card-unit">{unit}</span>}
        </span>
      </div>
      <style>{`
        .metric-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .metric-card:hover {
          background: rgba(0, 255, 136, 0.05);
          border-color: rgba(0, 255, 136, 0.2);
          transform: translateY(-2px);
        }

        .card-icon {
          font-size: 18px;
        }

        .card-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .card-label {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .card-value {
          font-size: 15px;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }

        .card-unit {
          font-size: 10px;
          margin-left: 4px;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
