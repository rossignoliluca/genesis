/**
 * BackCover — Outro with branding animation.
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';

interface BackCoverProps {
  content: any;
  meta: any;
}

export const BackCover: React.FC<BackCoverProps> = ({ content, meta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const company = content?.company || meta?.company || 'Rossignoli & Partners';
  const closing = content?.closing || 'Thank you';
  const tagline = content?.tagline || '';
  const contactLines = content?.contact_lines || [];

  const closingOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const closingScale = spring({ frame, fps, from: 0.9, to: 1, durationInFrames: 25 });

  const companyOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const contactOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #2C3E50 0%, #1a252f 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          opacity: closingOpacity,
          transform: `scale(${closingScale})`,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 42,
          fontWeight: 700,
          color: 'white',
          marginBottom: 16,
        }}
      >
        {closing}
      </div>

      <div
        style={{
          opacity: companyOpacity,
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 20,
          fontWeight: 500,
          color: '#E8792B',
          marginBottom: 32,
        }}
      >
        {company}
      </div>

      {tagline && (
        <div
          style={{
            opacity: companyOpacity,
            fontFamily: 'Inter, Arial',
            fontSize: 15,
            color: 'rgba(255,255,255,0.6)',
            marginBottom: 24,
          }}
        >
          {tagline}
        </div>
      )}

      <div style={{ opacity: contactOpacity }}>
        {contactLines.map((line: string, i: number) => (
          <div
            key={i}
            style={{
              fontFamily: 'Inter, Arial',
              fontSize: 14,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 4,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Bottom accent bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          background: '#E8792B',
        }}
      />
    </AbsoluteFill>
  );
};
