/**
 * MetricCard - Display card for single metrics with trends
 */
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const sizeStyles = {
  sm: { padding: '12px', fontSize: 20, titleSize: 11 },
  md: { padding: '16px', fontSize: 28, titleSize: 12 },
  lg: { padding: '24px', fontSize: 36, titleSize: 14 },
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  color = '#00ff88',
  size = 'md',
  onClick,
}: MetricCardProps) {
  const styles = sizeStyles[size];

  const trendColors = {
    up: '#00ff88',
    down: '#ff4444',
    stable: '#888888',
  };

  const trendIcons = {
    up: '↗',
    down: '↘',
    stable: '→',
  };

  return (
    <motion.div
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        padding: styles.padding,
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      whileHover={onClick ? { scale: 1.02, borderColor: `${color}40` } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
    >
      {/* Gradient accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${color}, transparent)`,
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: styles.titleSize, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {title}
        </div>
        {icon && <div style={{ color, opacity: 0.8 }}>{icon}</div>}
      </div>

      {/* Value */}
      <motion.div
        style={{
          fontSize: styles.fontSize,
          fontWeight: 'bold',
          color,
          fontFamily: 'monospace',
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {value}
      </motion.div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{subtitle}</div>
        )}

        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: trendColors[trend] }}>
            <span>{trendIcons[trend]}</span>
            {trendValue && <span>{trendValue}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * StatusCard - Card showing module/system status
 */
interface StatusCardProps {
  title: string;
  status: 'active' | 'idle' | 'error' | 'disabled';
  description?: string;
  metrics?: { label: string; value: string | number }[];
  actions?: { label: string; onClick: () => void }[];
}

export function StatusCard({
  title,
  status,
  description,
  metrics,
  actions,
}: StatusCardProps) {
  const statusConfig = {
    active: { color: '#00ff88', label: 'Active', icon: '●' },
    idle: { color: '#888888', label: 'Idle', icon: '○' },
    error: { color: '#ff4444', label: 'Error', icon: '!' },
    disabled: { color: '#444444', label: 'Disabled', icon: '−' },
  };

  const config = statusConfig[status];

  return (
    <motion.div
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        padding: 16,
        border: `1px solid ${config.color}30`,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{title}</div>
        <motion.div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: `${config.color}20`,
            borderRadius: 12,
            fontSize: 11,
            color: config.color,
          }}
          animate={status === 'active' ? { opacity: [1, 0.7, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </motion.div>
      </div>

      {/* Description */}
      {description && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
          {description}
        </div>
      )}

      {/* Metrics */}
      {metrics && metrics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 12, marginBottom: 12 }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: 'rgba(255,255,255,0.9)', fontFamily: 'monospace' }}>
                {m.value}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {actions.map((a, i) => (
            <motion.button
              key={i}
              onClick={a.onClick}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.8)',
                fontSize: 12,
                cursor: 'pointer',
              }}
              whileHover={{ background: 'rgba(255,255,255,0.15)' }}
              whileTap={{ scale: 0.98 }}
            >
              {a.label}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/**
 * AlertCard - Card for displaying alerts and notifications
 */
interface AlertCardProps {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp?: number;
  onDismiss?: () => void;
}

export function AlertCard({ type, title, message, timestamp, onDismiss }: AlertCardProps) {
  const typeConfig = {
    info: { color: '#4488ff', icon: 'ℹ' },
    warning: { color: '#ffaa00', icon: '⚠' },
    error: { color: '#ff4444', icon: '✕' },
    success: { color: '#00ff88', icon: '✓' },
  };

  const config = typeConfig[type];

  return (
    <motion.div
      style={{
        background: `${config.color}10`,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: '0 8px 8px 0',
        padding: 12,
        position: 'relative',
      }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ color: config.color, fontSize: 16 }}>{config.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{message}</div>
          {timestamp && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
              {new Date(timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
        {onDismiss && (
          <motion.button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              fontSize: 16,
              padding: 0,
            }}
            whileHover={{ color: 'rgba(255,255,255,0.8)' }}
          >
            ×
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
