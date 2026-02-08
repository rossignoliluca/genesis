/**
 * PhiGauge - Specialized gauge for IIT phi (integrated information)
 *
 * Features consciousness state indicators and phi-specific coloring.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface PhiGaugeProps {
  phi: number;
  state?: 'dormant' | 'drowsy' | 'aware' | 'alert' | 'peak';
  size?: number;
  showState?: boolean;
  integration?: number;
  complexity?: number;
}

const stateColors = {
  dormant: '#666666',
  drowsy: '#888844',
  aware: '#44aa44',
  alert: '#00ff88',
  peak: '#00ffff',
};

const stateThresholds = {
  dormant: 0.3,
  drowsy: 0.5,
  aware: 0.7,
  alert: 0.9,
  peak: 1.0,
};

export function PhiGauge({
  phi,
  state,
  size = 160,
  showState = true,
  integration,
  complexity,
}: PhiGaugeProps) {
  const derivedState = useMemo(() => {
    if (state) return state;
    if (phi >= 0.9) return 'peak';
    if (phi >= 0.7) return 'alert';
    if (phi >= 0.5) return 'aware';
    if (phi >= 0.3) return 'drowsy';
    return 'dormant';
  }, [phi, state]);

  const color = stateColors[derivedState];
  const strokeWidth = size / 12;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Create gradient stops for the arc
  const gradientId = useMemo(() => `phi-gradient-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="phi-gauge" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={stateColors.dormant} />
            <stop offset="30%" stopColor={stateColors.drowsy} />
            <stop offset="50%" stopColor={stateColors.aware} />
            <stop offset="70%" stopColor={stateColors.alert} />
            <stop offset="100%" stopColor={stateColors.peak} />
          </linearGradient>
          <filter id="phi-glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          transform={`rotate(-90 ${center} ${center})`}
        />

        {/* Phi arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - phi) }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          transform={`rotate(-90 ${center} ${center})`}
          filter="url(#phi-glow)"
        />

        {/* State indicator dots */}
        {Object.entries(stateThresholds).map(([s, threshold], i) => {
          const angle = -90 + threshold * 360;
          const rad = (angle * Math.PI) / 180;
          const x = center + (radius + strokeWidth) * Math.cos(rad);
          const y = center + (radius + strokeWidth) * Math.sin(rad);
          const isActive = phi >= threshold - 0.1;

          return (
            <motion.circle
              key={s}
              cx={x}
              cy={y}
              r={3}
              fill={isActive ? stateColors[s as keyof typeof stateColors] : 'rgba(255,255,255,0.2)'}
              initial={{ scale: 0 }}
              animate={{ scale: isActive ? 1 : 0.5 }}
              transition={{ delay: i * 0.1 }}
            />
          );
        })}
      </svg>

      {/* Center content */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <motion.div
          style={{
            fontSize: size / 3.5,
            fontWeight: 'bold',
            color,
            fontFamily: 'monospace',
            textShadow: `0 0 20px ${color}60`,
          }}
          animate={{ color }}
          transition={{ duration: 0.3 }}
        >
          φ {phi.toFixed(2)}
        </motion.div>

        {showState && (
          <motion.div
            style={{
              fontSize: size / 12,
              color,
              textTransform: 'uppercase',
              letterSpacing: 2,
              marginTop: 4,
            }}
            animate={{ color }}
          >
            {derivedState}
          </motion.div>
        )}

        {(integration !== undefined || complexity !== undefined) && (
          <div style={{ marginTop: 8, display: 'flex', gap: 12, justifyContent: 'center' }}>
            {integration !== undefined && (
              <div style={{ fontSize: size / 14, color: 'rgba(255,255,255,0.5)' }}>
                I: {(integration * 100).toFixed(0)}%
              </div>
            )}
            {complexity !== undefined && (
              <div style={{ fontSize: size / 14, color: 'rgba(255,255,255,0.5)' }}>
                C: {(complexity * 100).toFixed(0)}%
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
