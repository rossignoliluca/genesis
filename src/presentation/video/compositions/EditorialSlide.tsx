/**
 * EditorialSlide — Commentary-focused slide with scroll-up animation.
 * Used when editorial slides have no chart.
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

interface EditorialSlideProps {
  content: any;
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

export const EditorialSlide: React.FC<EditorialSlideProps> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const section = content?.section || '';
  const title = content?.title || '';
  const commentary = content?.commentary || '';
  const badgeColor = SECTION_BADGE_COLORS[section?.toLowerCase()?.replace(/\s+/g, '_')] || '#6B7B8D';

  const badgeOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 30, to: 0, durationInFrames: 20 });
  const titleOpacity = interpolate(frame, [5, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bodyOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ padding: '80px 120px', flexDirection: 'column' }}>
      {section && (
        <span
          style={{
            opacity: badgeOpacity,
            display: 'inline-block',
            padding: '6px 20px',
            borderRadius: 3,
            fontFamily: 'DM Sans, Arial',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase' as const,
            color: 'white',
            background: badgeColor,
            marginBottom: 20,
            alignSelf: 'flex-start',
          }}
        >
          {section}
        </span>
      )}

      <h2
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 36,
          fontWeight: 700,
          color: '#E8792B',
          lineHeight: 1.2,
          marginBottom: 24,
          maxWidth: 1400,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          opacity: bodyOpacity,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 20,
          lineHeight: 1.8,
          color: '#2C3E50',
          maxWidth: 1400,
          columnCount: commentary.length > 500 ? 2 : 1,
          columnGap: 48,
        }}
      >
        {commentary}
      </div>
    </AbsoluteFill>
  );
};
