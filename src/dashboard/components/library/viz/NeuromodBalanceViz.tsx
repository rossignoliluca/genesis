/**
 * NeuromodBalanceViz - Neuromodulator balance visualization
 *
 * Shows dopamine, serotonin, norepinephrine, acetylcholine as interacting forces.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface NeuromodLevels {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  acetylcholine: number;
  cortisol?: number;
}

interface NeuromodBalanceVizProps {
  levels: NeuromodLevels;
  size?: number;
  showLabels?: boolean;
  showEffects?: boolean;
  animate?: boolean;
}

const neuromodConfig = {
  dopamine: {
    color: '#00ff88',
    label: 'DA',
    fullName: 'Dopamine',
    effect: 'Motivation & Reward',
  },
  serotonin: {
    color: '#ff8800',
    label: 'SE',
    fullName: 'Serotonin',
    effect: 'Mood & Patience',
  },
  norepinephrine: {
    color: '#ff4488',
    label: 'NE',
    fullName: 'Norepinephrine',
    effect: 'Alertness & Focus',
  },
  acetylcholine: {
    color: '#4488ff',
    label: 'ACh',
    fullName: 'Acetylcholine',
    effect: 'Learning & Memory',
  },
  cortisol: {
    color: '#ff4444',
    label: 'CO',
    fullName: 'Cortisol',
    effect: 'Stress Response',
  },
};

export function NeuromodBalanceViz({
  levels,
  size = 200,
  showLabels = true,
  showEffects = false,
  animate = true,
}: NeuromodBalanceVizProps) {
  const center = size / 2;
  const maxRadius = size / 2 - 30;

  // Calculate positions for each neuromodulator
  const positions = useMemo(() => {
    const keys = Object.keys(levels) as (keyof NeuromodLevels)[];
    const angleStep = (Math.PI * 2) / keys.length;

    return keys.map((key, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const value = levels[key] || 0;
      const config = neuromodConfig[key];

      return {
        key,
        angle,
        value,
        config,
        x: center + Math.cos(angle) * maxRadius * 0.7,
        y: center + Math.sin(angle) * maxRadius * 0.7,
        labelX: center + Math.cos(angle) * (maxRadius + 15),
        labelY: center + Math.sin(angle) * (maxRadius + 15),
      };
    });
  }, [levels, center, maxRadius]);

  // Create balance polygon
  const polygonPoints = useMemo(() => {
    return positions
      .map((p) => {
        const r = maxRadius * p.value * 0.8;
        const x = center + Math.cos(p.angle) * r;
        const y = center + Math.sin(p.angle) * r;
        return `${x},${y}`;
      })
      .join(' ');
  }, [positions, center, maxRadius]);

  // Calculate overall balance state
  const balanceState = useMemo(() => {
    const values = Object.values(levels);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;

    if (variance < 0.02) return { label: 'Balanced', color: '#00ff88' };
    if (variance < 0.05) return { label: 'Stable', color: '#88ff88' };
    if (variance < 0.1) return { label: 'Fluctuating', color: '#ffaa00' };
    return { label: 'Imbalanced', color: '#ff4444' };
  }, [levels]);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          {/* Gradient for each neuromodulator */}
          {positions.map((p) => (
            <radialGradient key={p.key} id={`neuro-grad-${p.key}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={p.config.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={p.config.color} stopOpacity="0.1" />
            </radialGradient>
          ))}
          <filter id="neuro-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circles */}
        {[0.25, 0.5, 0.75, 1].map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={maxRadius * level * 0.8}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {positions.map((p) => (
          <line
            key={p.key}
            x1={center}
            y1={center}
            x2={center + Math.cos(p.angle) * maxRadius * 0.8}
            y2={center + Math.sin(p.angle) * maxRadius * 0.8}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />
        ))}

        {/* Balance polygon */}
        <motion.polygon
          points={polygonPoints}
          fill="rgba(100,150,255,0.15)"
          stroke="rgba(100,150,255,0.5)"
          strokeWidth={2}
          filter="url(#neuro-glow)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* Neuromodulator nodes */}
        {positions.map((p) => (
          <g key={p.key}>
            {/* Value indicator */}
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={12 + p.value * 10}
              fill={`url(#neuro-grad-${p.key})`}
              stroke={p.config.color}
              strokeWidth={2}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={animate ? { duration: 0.5, delay: 0.1 } : { duration: 0 }}
            />

            {/* Pulse for high values */}
            {p.value > 0.7 && (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={15 + p.value * 10}
                fill="none"
                stroke={p.config.color}
                strokeWidth={1}
                animate={{
                  r: [15 + p.value * 10, 25 + p.value * 10],
                  opacity: [0.5, 0],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
              />
            )}

            {/* Label */}
            {showLabels && (
              <text
                x={p.labelX}
                y={p.labelY}
                textAnchor="middle"
                alignmentBaseline="middle"
                fill={p.config.color}
                fontSize={11}
                fontWeight="bold"
              >
                {p.config.label}
              </text>
            )}
          </g>
        ))}

        {/* Center balance indicator */}
        <motion.circle
          cx={center}
          cy={center}
          r={15}
          fill={balanceState.color}
          opacity={0.3}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </svg>

      {/* Balance state label */}
      <div
        style={{
          position: 'absolute',
          bottom: 5,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          color: balanceState.color,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {balanceState.label}
      </div>

      {/* Effects panel */}
      {showEffects && (
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: 0,
            width: 110,
            fontSize: 9,
          }}
        >
          {positions.map((p) => (
            <div key={p.key} style={{ marginBottom: 8 }}>
              <div style={{ color: p.config.color, fontWeight: 'bold' }}>
                {p.config.fullName}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)' }}>
                {p.config.effect}
              </div>
              <div
                style={{
                  height: 3,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 2,
                  marginTop: 2,
                }}
              >
                <motion.div
                  style={{
                    height: '100%',
                    background: p.config.color,
                    borderRadius: 2,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.value * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
