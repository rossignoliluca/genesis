/**
 * RadarChart - Multi-axis radar/spider chart
 *
 * Perfect for neuromodulator balance, skill profiles, and multi-dimensional metrics.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface RadarDataPoint {
  axis: string;
  value: number;
  max?: number;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;
  color?: string;
  fillOpacity?: number;
  showLabels?: boolean;
  showValues?: boolean;
  levels?: number;
  animate?: boolean;
}

export function RadarChart({
  data,
  size = 200,
  color = '#00ff88',
  fillOpacity = 0.3,
  showLabels = true,
  showValues = false,
  levels = 5,
  animate = true,
}: RadarChartProps) {
  const center = size / 2;
  const radius = size / 2 - 30;
  const angleSlice = (Math.PI * 2) / data.length;

  // Calculate points for the data polygon
  const dataPoints = useMemo(() => {
    return data.map((d, i) => {
      const maxVal = d.max || 1;
      const normalizedValue = Math.min(d.value / maxVal, 1);
      const angle = angleSlice * i - Math.PI / 2;
      return {
        x: center + radius * normalizedValue * Math.cos(angle),
        y: center + radius * normalizedValue * Math.sin(angle),
        value: d.value,
        label: d.axis,
      };
    });
  }, [data, center, radius, angleSlice]);

  // Create polygon path
  const polygonPath = useMemo(() => {
    return dataPoints.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ') + ' Z';
  }, [dataPoints]);

  // Level circles
  const levelCircles = useMemo(() => {
    return Array.from({ length: levels }, (_, i) => {
      const levelRadius = (radius / levels) * (i + 1);
      return levelRadius;
    });
  }, [levels, radius]);

  return (
    <svg width={size} height={size}>
      <defs>
        <radialGradient id="radar-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={fillOpacity * 0.5} />
        </radialGradient>
        <filter id="radar-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background level circles */}
      {levelCircles.map((r, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
      ))}

      {/* Axis lines */}
      {data.map((_, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
          />
        );
      })}

      {/* Data polygon */}
      <motion.path
        d={polygonPath}
        fill="url(#radar-gradient)"
        stroke={color}
        strokeWidth={2}
        filter="url(#radar-glow)"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={animate ? { duration: 0.6, ease: 'easeOut' } : { duration: 0 }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4}
          fill={color}
          stroke="white"
          strokeWidth={1}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={animate ? { delay: i * 0.05, duration: 0.3 } : { duration: 0 }}
        />
      ))}

      {/* Labels */}
      {showLabels &&
        data.map((d, i) => {
          const angle = angleSlice * i - Math.PI / 2;
          const labelRadius = radius + 20;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);

          // Adjust text anchor based on position
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (x < center - 10) textAnchor = 'end';
          else if (x > center + 10) textAnchor = 'start';

          return (
            <g key={i}>
              <text
                x={x}
                y={y}
                textAnchor={textAnchor}
                alignmentBaseline="middle"
                fill="rgba(255,255,255,0.8)"
                fontSize={11}
                fontWeight={500}
              >
                {d.axis}
              </text>
              {showValues && (
                <text
                  x={x}
                  y={y + 12}
                  textAnchor={textAnchor}
                  alignmentBaseline="middle"
                  fill={color}
                  fontSize={10}
                  fontFamily="monospace"
                >
                  {d.value.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
