/**
 * TimeSeriesChart - Real-time time series visualization
 *
 * Uses D3 for rendering with smooth animations and multiple series support.
 */
import { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface Series {
  id: string;
  data: DataPoint[];
  color: string;
  label?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

interface TimeSeriesChartProps {
  series: Series[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  yDomain?: [number, number];
  timeWindow?: number; // ms
  animate?: boolean;
}

export function TimeSeriesChart({
  series,
  width = 400,
  height = 200,
  margin = { top: 20, right: 20, bottom: 30, left: 50 },
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  yDomain,
  timeWindow = 60000, // 1 minute default
  animate = true,
}: TimeSeriesChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Compute scales
  const { xScale, yScale } = useMemo(() => {
    const now = Date.now();
    const xScale = d3
      .scaleTime()
      .domain([now - timeWindow, now])
      .range([0, innerWidth]);

    const allValues = series.flatMap((s) => s.data.map((d) => d.value));
    const minY = yDomain?.[0] ?? d3.min(allValues) ?? 0;
    const maxY = yDomain?.[1] ?? d3.max(allValues) ?? 1;

    const yScale = d3
      .scaleLinear()
      .domain([minY * 0.9, maxY * 1.1])
      .range([innerHeight, 0])
      .nice();

    return { xScale, yScale };
  }, [series, innerWidth, innerHeight, timeWindow, yDomain]);

  // Line generator
  const lineGenerator = useMemo(
    () =>
      d3
        .line<DataPoint>()
        .x((d) => xScale(d.timestamp))
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX),
    [xScale, yScale]
  );

  // Area generator for gradient fill
  const areaGenerator = useMemo(
    () =>
      d3
        .area<DataPoint>()
        .x((d) => xScale(d.timestamp))
        .y0(innerHeight)
        .y1((d) => yScale(d.value))
        .curve(d3.curveMonotoneX),
    [xScale, yScale, innerHeight]
  );

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height}>
        <defs>
          {series.map((s) => (
            <linearGradient
              key={`gradient-${s.id}`}
              id={`area-gradient-${s.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Grid lines */}
          {showGrid && (
            <g className="grid" opacity={0.2}>
              {yScale.ticks(5).map((tick) => (
                <line
                  key={tick}
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="white"
                  strokeDasharray="2,2"
                />
              ))}
              {xScale.ticks(5).map((tick) => (
                <line
                  key={tick.getTime()}
                  x1={xScale(tick)}
                  x2={xScale(tick)}
                  y1={0}
                  y2={innerHeight}
                  stroke="white"
                  strokeDasharray="2,2"
                />
              ))}
            </g>
          )}

          {/* X Axis */}
          <g transform={`translate(0,${innerHeight})`}>
            <line x1={0} x2={innerWidth} y1={0} y2={0} stroke="rgba(255,255,255,0.3)" />
            {xScale.ticks(4).map((tick) => (
              <g key={tick.getTime()} transform={`translate(${xScale(tick)},0)`}>
                <line y1={0} y2={5} stroke="rgba(255,255,255,0.3)" />
                <text
                  y={15}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize={10}
                >
                  {d3.timeFormat('%H:%M:%S')(tick)}
                </text>
              </g>
            ))}
          </g>

          {/* Y Axis */}
          <g>
            <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="rgba(255,255,255,0.3)" />
            {yScale.ticks(5).map((tick) => (
              <g key={tick} transform={`translate(0,${yScale(tick)})`}>
                <line x1={-5} x2={0} stroke="rgba(255,255,255,0.3)" />
                <text
                  x={-10}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize={10}
                >
                  {tick.toFixed(2)}
                </text>
              </g>
            ))}
          </g>

          {/* Data series */}
          {series.map((s) => {
            const filteredData = s.data.filter(
              (d) => d.timestamp >= Date.now() - timeWindow
            );
            if (filteredData.length < 2) return null;

            return (
              <g key={s.id}>
                {/* Area fill */}
                <motion.path
                  d={areaGenerator(filteredData) || ''}
                  fill={`url(#area-gradient-${s.id})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />

                {/* Line */}
                <motion.path
                  d={lineGenerator(filteredData) || ''}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.strokeWidth || 2}
                  strokeDasharray={s.dashed ? '5,5' : undefined}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={animate ? { duration: 0.8 } : { duration: 0 }}
                />

                {/* End point indicator */}
                {filteredData.length > 0 && (
                  <motion.circle
                    cx={xScale(filteredData[filteredData.length - 1].timestamp)}
                    cy={yScale(filteredData[filteredData.length - 1].value)}
                    r={4}
                    fill={s.color}
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      {showLegend && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 8,
            justifyContent: 'center',
            fontSize: 12,
          }}
        >
          {series.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 3,
                  backgroundColor: s.color,
                  borderRadius: 2,
                }}
              />
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{s.label || s.id}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            display: 'none',
            background: 'rgba(0,0,0,0.9)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '8px 12px',
            fontSize: 12,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
