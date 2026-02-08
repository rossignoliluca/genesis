/**
 * CircularGauge - Animated circular progress indicator
 *
 * Uses SVG with smooth animations for real-time value display.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface CircularGaugeProps {
  value: number;
  min?: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  unit?: string;
  color?: string;
  bgColor?: string;
  showValue?: boolean;
  animate?: boolean;
  glow?: boolean;
}

export function CircularGauge({
  value,
  min = 0,
  max = 1,
  size = 120,
  strokeWidth = 8,
  label,
  unit = '',
  color = '#00ff88',
  bgColor = 'rgba(255,255,255,0.1)',
  showValue = true,
  animate = true,
  glow = true,
}: CircularGaugeProps) {
  const normalizedValue = Math.max(min, Math.min(max, value));
  const percentage = ((normalizedValue - min) / (max - min)) * 100;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const center = size / 2;

  const displayValue = useMemo(() => {
    if (max <= 1) {
      return (normalizedValue * 100).toFixed(0);
    }
    return normalizedValue.toFixed(max >= 1000 ? 0 : 1);
  }, [normalizedValue, max]);

  return (
    <div className="circular-gauge" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={animate ? { duration: 0.5, ease: 'easeOut' } : { duration: 0 }}
          style={{
            filter: glow ? `drop-shadow(0 0 ${strokeWidth}px ${color}40)` : undefined,
          }}
        />
      </svg>

      {showValue && (
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
              fontSize: size / 4,
              fontWeight: 'bold',
              color,
              fontFamily: 'monospace',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {displayValue}
            {unit && <span style={{ fontSize: size / 8, opacity: 0.7 }}>{unit}</span>}
          </motion.div>
          {label && (
            <div
              style={{
                fontSize: size / 10,
                color: 'rgba(255,255,255,0.6)',
                marginTop: 4,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
