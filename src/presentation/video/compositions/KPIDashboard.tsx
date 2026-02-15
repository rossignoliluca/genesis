/**
 * KPIDashboard — Animated number counters for key metrics.
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

interface KPIDashboardProps {
  content: any;
}

const AnimatedNumber: React.FC<{
  value: string;
  delay: number;
  color: string;
}> = ({ value, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Try to parse numeric value for animation
  const numericMatch = value.match(/([-+]?[\d,.]+)/);
  const numericValue = numericMatch ? parseFloat(numericMatch[1].replace(/,/g, '')) : null;

  const progress = interpolate(
    Math.max(0, frame - delay),
    [0, 40],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const scale = spring({
    frame: Math.max(0, frame - delay),
    fps,
    from: 0.8,
    to: 1,
    durationInFrames: 25,
  });

  let displayValue = value;
  if (numericValue !== null && progress < 1) {
    const currentNum = numericValue * progress;
    // Preserve the original formatting
    const prefix = value.substring(0, value.indexOf(numericMatch![1]));
    const suffix = value.substring(value.indexOf(numericMatch![1]) + numericMatch![1].length);
    const formatted = Math.abs(currentNum) >= 1000
      ? currentNum.toLocaleString('en-US', { maximumFractionDigits: 1 })
      : currentNum.toFixed(numericMatch![1].includes('.') ? (numericMatch![1].split('.')[1]?.length || 0) : 0);
    displayValue = `${prefix}${formatted}${suffix}`;
  }

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        fontFamily: 'DM Sans, Arial, sans-serif',
        fontSize: 42,
        fontWeight: 700,
        color,
        lineHeight: 1.1,
      }}
    >
      {displayValue}
    </div>
  );
};

export const KPIDashboard: React.FC<KPIDashboardProps> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const title = content?.title || 'Key Performance Indicators';
  const kpis = content?.kpis || [];

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 20, to: 0, durationInFrames: 20 });

  return (
    <AbsoluteFill style={{ padding: '60px 86px', flexDirection: 'column' }}>
      <h2
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 32,
          fontWeight: 700,
          color: '#E8792B',
          marginBottom: 40,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'stretch',
        }}
      >
        {kpis.map((kpi: any, i: number) => {
          const cardDelay = 10 + i * 8;
          const cardOpacity = interpolate(frame, [cardDelay, cardDelay + 15], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const cardY = spring({
            frame: Math.max(0, frame - cardDelay),
            fps,
            from: 30,
            to: 0,
            durationInFrames: 20,
          });

          const deltaClass = kpi.delta?.startsWith('+') ? '#27AE60' : kpi.delta?.startsWith('-') ? '#C0392B' : '#6B7B8D';
          const valueColor = kpi.color || '#2C3E50';

          return (
            <div
              key={i}
              style={{
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
                flex: 1,
                minWidth: 200,
                maxWidth: 400,
                background: '#FFFFFF',
                border: '1px solid #E0E0E0',
                borderRadius: 12,
                padding: '28px 32px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <AnimatedNumber
                value={kpi.value || '0'}
                delay={cardDelay + 5}
                color={valueColor}
              />
              <div
                style={{
                  fontSize: 13,
                  color: '#6B7B8D',
                  marginTop: 8,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.5,
                  fontFamily: 'Inter, Arial',
                }}
              >
                {kpi.label}
              </div>
              {kpi.delta && (
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginTop: 4,
                    color: deltaClass,
                  }}
                >
                  {kpi.delta}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
