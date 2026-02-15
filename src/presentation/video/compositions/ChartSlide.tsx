/**
 * ChartSlide — Chart PNG with entrance animation (scale + fade).
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Img,
} from 'remotion';

interface ChartSlideProps {
  content: any;
  chartPath?: string;
  isEditorial?: boolean;
}

const SECTION_BADGE_COLORS: Record<string, string> = {
  equities: '#27AE60',
  fixed_income: '#8E44AD',
  fx: '#2980B9',
  commodities: '#D4A056',
  macro: '#E74C3C',
  crypto: '#F39C12',
  geopolitics: '#1ABC9C',
  central_banks: '#34495E',
};

export const ChartSlide: React.FC<ChartSlideProps> = ({
  content,
  chartPath,
  isEditorial = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const title = content?.title || '';
  const tag = content?.tag || '';
  const section = content?.section || '';
  const commentary = content?.commentary || '';
  const source = content?.source || '';
  const badgeColor = SECTION_BADGE_COLORS[section?.toLowerCase()?.replace(/\s+/g, '_')] || '#6B7B8D';

  // Title animation
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 20, to: 0, durationInFrames: 20 });

  // Chart animation (delayed, scale up from 0.9)
  const chartDelay = isEditorial ? 25 : 15;
  const chartOpacity = interpolate(frame, [chartDelay, chartDelay + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const chartScale = spring({
    frame: Math.max(0, frame - chartDelay),
    fps,
    from: 0.92,
    to: 1,
    durationInFrames: 25,
  });

  // Commentary animation (editorial only)
  const commOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ padding: '60px 86px', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          marginBottom: isEditorial ? 8 : 20,
        }}
      >
        {isEditorial && section && (
          <span
            style={{
              display: 'inline-block',
              padding: '4px 16px',
              borderRadius: 3,
              fontFamily: 'DM Sans, Arial',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: 'uppercase' as const,
              color: 'white',
              background: badgeColor,
              marginBottom: 12,
              marginRight: 12,
            }}
          >
            {section}
          </span>
        )}
        {tag && !isEditorial && (
          <div
            style={{
              fontSize: 11,
              color: '#6B7B8D',
              textTransform: 'uppercase' as const,
              letterSpacing: 1.5,
              marginBottom: 8,
            }}
          >
            {tag}
          </div>
        )}
        <h2
          style={{
            fontFamily: 'DM Sans, Arial, sans-serif',
            fontSize: isEditorial ? 26 : 28,
            fontWeight: 700,
            color: '#E8792B',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
      </div>

      {/* Commentary (editorial) */}
      {isEditorial && commentary && (
        <p
          style={{
            opacity: commOpacity,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 14,
            color: '#2C3E50',
            lineHeight: 1.7,
            maxWidth: 1600,
            marginBottom: 16,
          }}
        >
          {commentary}
        </p>
      )}

      {/* Chart image */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: chartOpacity,
          transform: `scale(${chartScale})`,
        }}
      >
        {chartPath ? (
          <Img
            src={chartPath}
            style={{
              maxWidth: '100%',
              maxHeight: isEditorial ? 560 : 680,
              objectFit: 'contain',
              borderRadius: 4,
            }}
          />
        ) : (
          <div
            style={{
              width: '80%',
              height: 400,
              background: '#FAFBFC',
              borderRadius: 12,
              border: '1px solid #E0E0E0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6B7B8D',
              fontSize: 18,
            }}
          >
            Chart
          </div>
        )}
      </div>

      {/* Source */}
      {source && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 86,
            fontSize: 11,
            color: '#8899AA',
            fontStyle: 'italic',
          }}
        >
          {source}
        </div>
      )}
    </AbsoluteFill>
  );
};
