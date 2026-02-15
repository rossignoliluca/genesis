/**
 * SectionDivider — Animated section transition with wipe effect.
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

interface SectionDividerProps {
  content: any;
}

export const SectionDivider: React.FC<SectionDividerProps> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const title = content?.title || '';
  const subtitle = content?.subtitle || '';
  const sectionNum = content?.section_num || '';

  // Wipe animation: background color sweeps in from left
  const wipeProgress = interpolate(frame, [0, 15], [0, 100], {
    extrapolateRight: 'clamp',
  });

  // Number background element
  const numOpacity = interpolate(frame, [10, 25], [0, 0.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const numScale = spring({ frame: Math.max(0, frame - 5), fps, from: 0.8, to: 1, durationInFrames: 25 });

  // Title
  const titleOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleY = spring({ frame: Math.max(0, frame - 15), fps, from: 20, to: 0, durationInFrames: 20 });

  // Subtitle
  const subOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(90deg, #2C3E50 ${wipeProgress}%, #1a252f ${wipeProgress}%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Giant background number */}
      {sectionNum && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -60%) scale(${numScale})`,
            fontFamily: 'DM Sans, Arial, sans-serif',
            fontSize: 200,
            fontWeight: 700,
            color: `rgba(255,255,255,${numOpacity})`,
          }}
        >
          {sectionNum}
        </div>
      )}

      <h1
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 52,
          fontWeight: 700,
          color: 'white',
          zIndex: 1,
        }}
      >
        {title}
      </h1>

      {subtitle && (
        <div
          style={{
            opacity: subOpacity,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 18,
            color: 'rgba(255,255,255,0.6)',
            marginTop: 16,
            zIndex: 1,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
