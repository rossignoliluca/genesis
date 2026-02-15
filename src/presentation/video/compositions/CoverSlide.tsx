/**
 * CoverSlide — Animated cover with fade-in title + brand reveal.
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

interface CoverSlideProps {
  content: any;
  meta: any;
}

export const CoverSlide: React.FC<CoverSlideProps> = ({ content, meta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const company = content?.company || meta?.company || 'Rossignoli & Partners';
  const headline = content?.headline || meta?.title || '';
  const subheadline = content?.subheadline || content?.tagline || '';
  const dateRange = content?.date_range || meta?.date || '';

  // Animations
  const companyOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const companyY = spring({ frame, fps, from: -20, to: 0, durationInFrames: 25 });

  const headlineOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const headlineScale = spring({ frame: Math.max(0, frame - 15), fps, from: 0.95, to: 1, durationInFrames: 25 });

  const subOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const dateOpacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #2C3E50 0%, #1a252f 50%, #2C3E50 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Orange accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          background: '#E8792B',
        }}
      />

      <div
        style={{
          opacity: companyOpacity,
          transform: `translateY(${companyY}px)`,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 18,
          fontWeight: 500,
          letterSpacing: 4,
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.7)',
          marginBottom: 32,
        }}
      >
        {company}
      </div>

      <h1
        style={{
          opacity: headlineOpacity,
          transform: `scale(${headlineScale})`,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 64,
          fontWeight: 700,
          color: 'white',
          maxWidth: 1400,
          lineHeight: 1.15,
          marginBottom: 24,
        }}
      >
        {headline}
      </h1>

      {subheadline && (
        <div
          style={{
            opacity: subOpacity,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 22,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.8)',
            maxWidth: 900,
            marginBottom: 40,
          }}
        >
          {subheadline}
        </div>
      )}

      {dateRange && (
        <div
          style={{
            opacity: dateOpacity,
            padding: '10px 32px',
            border: '2px solid #E8792B',
            borderRadius: 4,
            fontFamily: 'DM Sans, Arial, sans-serif',
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: 1,
            color: '#E8792B',
          }}
        >
          {dateRange}
        </div>
      )}
    </AbsoluteFill>
  );
};
