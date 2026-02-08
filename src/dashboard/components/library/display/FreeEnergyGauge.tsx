/**
 * FreeEnergyGauge - Specialized gauge for Free Energy Principle metrics
 *
 * Shows free energy, surprise, and prediction error with scientific styling.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface FreeEnergyGaugeProps {
  freeEnergy: number;
  surprise?: number;
  predictionError?: number;
  size?: number;
  maxEnergy?: number;
}

export function FreeEnergyGauge({
  freeEnergy,
  surprise,
  predictionError,
  size = 180,
  maxEnergy = 5,
}: FreeEnergyGaugeProps) {
  const normalizedEnergy = Math.min(freeEnergy / maxEnergy, 1);

  // Color based on energy level (lower is better in FEP)
  const energyColor = useMemo(() => {
    if (normalizedEnergy < 0.3) return '#00ff88'; // Low - good
    if (normalizedEnergy < 0.6) return '#ffaa00'; // Medium - caution
    return '#ff4444'; // High - needs attention
  }, [normalizedEnergy]);

  const center = size / 2;
  const outerRadius = size / 2 - 10;
  const innerRadius = outerRadius - 20;
  const coreRadius = innerRadius - 15;

  // Create arc path
  const createArc = (radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(center, center, radius, endAngle);
    const end = polarToCartesian(center, center, radius, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <filter id="fe-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="fe-core-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={energyColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={energyColor} stopOpacity="0.1" />
          </radialGradient>
        </defs>

        {/* Outer ring - Free Energy */}
        <circle
          cx={center}
          cy={center}
          r={outerRadius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={6}
        />
        <motion.path
          d={createArc(outerRadius, 0, normalizedEnergy * 360)}
          fill="none"
          stroke={energyColor}
          strokeWidth={6}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8 }}
          filter="url(#fe-glow)"
        />

        {/* Middle ring - Surprise (if provided) */}
        {surprise !== undefined && (
          <>
            <circle
              cx={center}
              cy={center}
              r={innerRadius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={4}
            />
            <motion.path
              d={createArc(innerRadius, 0, Math.min(surprise, 1) * 360)}
              fill="none"
              stroke="#ff8800"
              strokeWidth={4}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </>
        )}

        {/* Core - pulsing energy indicator */}
        <motion.circle
          cx={center}
          cy={center}
          r={coreRadius}
          fill="url(#fe-core-gradient)"
          animate={{
            r: [coreRadius, coreRadius + 5, coreRadius],
            opacity: [0.6, 0.8, 0.6],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </svg>

      {/* Center text */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: size / 8, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
          F
        </div>
        <motion.div
          style={{
            fontSize: size / 4,
            fontWeight: 'bold',
            color: energyColor,
            fontFamily: 'monospace',
          }}
          animate={{ color: energyColor }}
        >
          {freeEnergy.toFixed(2)}
        </motion.div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
          {surprise !== undefined && (
            <div style={{ fontSize: size / 14, color: '#ff8800' }}>
              S: {surprise.toFixed(2)}
            </div>
          )}
          {predictionError !== undefined && (
            <div style={{ fontSize: size / 14, color: '#8888ff' }}>
              ε: {predictionError.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Labels */}
      <div
        style={{
          position: 'absolute',
          bottom: 5,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: size / 16,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Free Energy
      </div>
    </div>
  );
}
