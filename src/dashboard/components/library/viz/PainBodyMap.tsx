/**
 * PainBodyMap - Visualization of nociception/pain system
 *
 * Shows pain stimuli sources and intensities as a body-like map.
 */
import { motion, AnimatePresence } from 'framer-motion';

interface PainStimulus {
  id: string;
  type: string;
  intensity: number;
  source: string;
  timestamp: number;
}

interface PainBodyMapProps {
  stimuli: PainStimulus[];
  totalPain: number;
  threshold: number;
  adaptation: number;
  size?: number;
}

// Map pain types to body regions
const painRegions: Record<string, { x: number; y: number; label: string }> = {
  resource_depletion: { x: 0.5, y: 0.2, label: 'Resources' },
  goal_conflict: { x: 0.3, y: 0.4, label: 'Goals' },
  prediction_error: { x: 0.7, y: 0.4, label: 'Prediction' },
  ethical_violation: { x: 0.5, y: 0.5, label: 'Ethics' },
  memory_overload: { x: 0.3, y: 0.7, label: 'Memory' },
  attention_fatigue: { x: 0.7, y: 0.7, label: 'Attention' },
  social_rejection: { x: 0.5, y: 0.85, label: 'Social' },
};

export function PainBodyMap({
  stimuli,
  totalPain,
  threshold,
  adaptation,
  size = 250,
}: PainBodyMapProps) {
  // Determine overall state
  const painState =
    totalPain > threshold
      ? 'critical'
      : totalPain > threshold * 0.7
      ? 'elevated'
      : totalPain > threshold * 0.3
      ? 'mild'
      : 'minimal';

  const stateColors = {
    critical: '#ff4444',
    elevated: '#ff8800',
    mild: '#ffaa00',
    minimal: '#00ff88',
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <radialGradient id="pain-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={stateColors[painState]} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stateColors[painState]} stopOpacity="0" />
          </radialGradient>
          <filter id="pain-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Body outline (abstract representation) */}
        <ellipse
          cx={size / 2}
          cy={size / 2}
          rx={size * 0.35}
          ry={size * 0.4}
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2}
        />

        {/* Pain regions */}
        {Object.entries(painRegions).map(([type, region]) => {
          const x = region.x * size;
          const y = region.y * size;
          const activeStimulus = stimuli.find((s) => s.type === type);

          return (
            <g key={type}>
              {/* Region marker */}
              <circle
                cx={x}
                cy={y}
                r={8}
                fill={activeStimulus ? stateColors[painState] : 'rgba(255,255,255,0.1)'}
                opacity={activeStimulus ? activeStimulus.intensity : 0.3}
              />

              {/* Pain pulse for active stimuli */}
              {activeStimulus && (
                <motion.circle
                  cx={x}
                  cy={y}
                  r={8}
                  fill="none"
                  stroke={stateColors[painState]}
                  strokeWidth={2}
                  animate={{
                    r: [8, 20],
                    opacity: [0.8, 0],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                />
              )}

              {/* Label */}
              <text
                x={x}
                y={y + 20}
                textAnchor="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize={8}
              >
                {region.label}
              </text>
            </g>
          );
        })}

        {/* Central pain indicator */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={20 + totalPain * 30}
          fill="url(#pain-gradient)"
          filter="url(#pain-glow)"
          animate={{
            r: [20 + totalPain * 30, 25 + totalPain * 30, 20 + totalPain * 30],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Threshold ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={20 + threshold * 30}
          fill="none"
          stroke="rgba(255,68,68,0.3)"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      </svg>

      {/* Stats overlay */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 6,
          padding: 8,
          fontSize: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Pain</span>
          <span style={{ color: stateColors[painState], fontWeight: 'bold' }}>
            {(totalPain * 100).toFixed(0)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Threshold</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {(threshold * 100).toFixed(0)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Adaptation</span>
          <span style={{ color: '#00ff88' }}>
            {(adaptation * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Active stimuli list */}
      <AnimatePresence>
        {stimuli.length > 0 && (
          <motion.div
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              right: 10,
              background: 'rgba(0,0,0,0.7)',
              borderRadius: 6,
              padding: 8,
              fontSize: 9,
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              Active Stimuli
            </div>
            {stimuli.slice(0, 3).map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: stateColors[painState],
                }}
              >
                <span>{s.type}</span>
                <span>{(s.intensity * 100).toFixed(0)}%</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
