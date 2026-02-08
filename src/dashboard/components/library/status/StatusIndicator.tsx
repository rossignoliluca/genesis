/**
 * StatusIndicator - Visual status indicator with multiple states
 *
 * Shows operational status with animations and color coding.
 */
import { motion } from 'framer-motion';

type Status = 'online' | 'offline' | 'warning' | 'error' | 'pending' | 'success';

interface StatusIndicatorProps {
  status: Status;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
  showLabel?: boolean;
}

const statusConfig: Record<Status, { color: string; label: string }> = {
  online: { color: '#00ff88', label: 'Online' },
  offline: { color: '#666666', label: 'Offline' },
  warning: { color: '#ffaa00', label: 'Warning' },
  error: { color: '#ff4444', label: 'Error' },
  pending: { color: '#8888ff', label: 'Pending' },
  success: { color: '#00ff88', label: 'Success' },
};

const sizeConfig = {
  sm: { dot: 8, font: 11 },
  md: { dot: 12, font: 13 },
  lg: { dot: 16, font: 15 },
};

export function StatusIndicator({
  status,
  label,
  size = 'md',
  showPulse = true,
  showLabel = true,
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        {/* Pulse ring */}
        {showPulse && (status === 'online' || status === 'pending') && (
          <motion.div
            style={{
              position: 'absolute',
              width: sizes.dot,
              height: sizes.dot,
              borderRadius: '50%',
              border: `2px solid ${config.color}`,
            }}
            animate={{
              scale: [1, 2, 2],
              opacity: [0.8, 0, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}

        {/* Main dot */}
        <motion.div
          style={{
            width: sizes.dot,
            height: sizes.dot,
            borderRadius: '50%',
            backgroundColor: config.color,
            boxShadow: `0 0 ${sizes.dot}px ${config.color}60`,
          }}
          animate={
            status === 'pending'
              ? { opacity: [1, 0.5, 1] }
              : status === 'error'
              ? { scale: [1, 1.1, 1] }
              : {}
          }
          transition={{
            duration: status === 'pending' ? 1.5 : 0.5,
            repeat: Infinity,
          }}
        />
      </div>

      {showLabel && (
        <span
          style={{
            fontSize: sizes.font,
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 500,
          }}
        >
          {label || config.label}
        </span>
      )}
    </div>
  );
}

/**
 * InvariantBadge - Shows invariant check status
 */
interface InvariantBadgeProps {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'checking' | 'unknown';
  lastCheck?: number;
}

export function InvariantBadge({ id, name, status, lastCheck }: InvariantBadgeProps) {
  const statusColors = {
    pass: '#00ff88',
    fail: '#ff4444',
    checking: '#ffaa00',
    unknown: '#666666',
  };

  const statusIcons = {
    pass: '✓',
    fail: '✗',
    checking: '●',
    unknown: '?',
  };

  return (
    <motion.div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 6,
        border: `1px solid ${statusColors[status]}40`,
      }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ background: 'rgba(255,255,255,0.1)' }}
    >
      <motion.span
        style={{
          color: statusColors[status],
          fontWeight: 'bold',
          fontSize: 14,
        }}
        animate={status === 'checking' ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      >
        {statusIcons[status]}
      </motion.span>

      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{id}</span>

      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{name}</span>

      {lastCheck && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
          {new Date(lastCheck).toLocaleTimeString()}
        </span>
      )}
    </motion.div>
  );
}

/**
 * ConnectionStatus - Shows SSE connection status
 */
interface ConnectionStatusProps {
  connected: boolean;
  lastEvent?: number;
  reconnectAttempts?: number;
}

export function ConnectionStatus({
  connected,
  lastEvent,
  reconnectAttempts = 0,
}: ConnectionStatusProps) {
  const timeSinceEvent = lastEvent ? Date.now() - lastEvent : null;
  const isStale = timeSinceEvent && timeSinceEvent > 5000;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
      }}
    >
      <StatusIndicator
        status={connected ? (isStale ? 'warning' : 'online') : 'offline'}
        label={connected ? 'Connected' : 'Disconnected'}
        size="sm"
      />

      {connected && lastEvent && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Last: {Math.floor((Date.now() - lastEvent) / 1000)}s ago
        </span>
      )}

      {!connected && reconnectAttempts > 0 && (
        <span style={{ fontSize: 11, color: '#ffaa00' }}>
          Retry #{reconnectAttempts}
        </span>
      )}
    </div>
  );
}
