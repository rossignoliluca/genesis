/**
 * WeeklyReport — Main Remotion composition that sequences all slides.
 *
 * Reads the timeline from props.specPath, renders each slide component
 * in sequence with cross-fade transitions.
 */

import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Img,
  staticFile,
} from 'remotion';
import { CoverSlide } from './CoverSlide';
import { ChartSlide } from './ChartSlide';
import { EditorialSlide } from './EditorialSlide';
import { SectionDivider } from './SectionDivider';
import { KPIDashboard } from './KPIDashboard';
import { BackCover } from './BackCover';

// ============================================================================
// Types
// ============================================================================

interface SlideTimeline {
  slideIndex: number;
  slideType: string;
  startFrame: number;
  durationFrames: number;
  durationSeconds: number;
  chartPath?: string;
  content: any;
}

interface VideoProps {
  spec: any;
  timeline: SlideTimeline[];
  totalFrames: number;
  fps: number;
  chartPaths: Record<string, string>;
}

interface WeeklyReportProps {
  specPath: string;
}

// ============================================================================
// Generic Slide Wrapper (fade in/out + brand bar)
// ============================================================================

const SlideWrapper: React.FC<{
  children: React.ReactNode;
  durationFrames: number;
}> = ({ children, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in during first 0.5s
  const fadeIn = interpolate(frame, [0, Math.round(fps * 0.5)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fade out during last 0.3s
  const fadeOut = interpolate(
    frame,
    [durationFrames - Math.round(fps * 0.3), durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: '#FFFFFF' }}>
      {/* Orange accent line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: '#E8792B',
          zIndex: 100,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

// ============================================================================
// Fallback Text Slide
// ============================================================================

const TextSlide: React.FC<{ content: any; meta: any }> = ({ content, meta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideUp = spring({ frame, fps, from: 30, to: 0, durationInFrames: 20 });

  return (
    <AbsoluteFill
      style={{
        padding: '80px 100px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      <h2
        style={{
          fontFamily: 'DM Sans, Arial, sans-serif',
          fontSize: 42,
          fontWeight: 700,
          color: '#E8792B',
          marginBottom: 32,
          transform: `translateY(${slideUp}px)`,
        }}
      >
        {content?.title || ''}
      </h2>
      <div style={{ display: 'flex', gap: 40 }}>
        {content?.left_items && (
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontFamily: 'DM Sans, Arial',
                fontSize: 22,
                fontWeight: 600,
                color: content?.left_color || '#27AE60',
                marginBottom: 16,
                borderBottom: `3px solid ${content?.left_color || '#27AE60'}`,
                paddingBottom: 8,
              }}
            >
              {content?.left_icon || ''} {content?.left_title || ''}
            </h3>
            {content.left_items.map((item: string, i: number) => (
              <div
                key={i}
                style={{
                  fontFamily: 'Inter, Arial',
                  fontSize: 18,
                  color: '#2C3E50',
                  marginBottom: 12,
                  paddingLeft: 12,
                  borderLeft: `2px solid ${content?.left_color || '#27AE60'}30`,
                  opacity: interpolate(frame, [10 + i * 5, 15 + i * 5], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
        {content?.right_items && (
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontFamily: 'DM Sans, Arial',
                fontSize: 22,
                fontWeight: 600,
                color: content?.right_color || '#C0392B',
                marginBottom: 16,
                borderBottom: `3px solid ${content?.right_color || '#C0392B'}`,
                paddingBottom: 8,
              }}
            >
              {content?.right_icon || ''} {content?.right_title || ''}
            </h3>
            {content.right_items.map((item: string, i: number) => (
              <div
                key={i}
                style={{
                  fontFamily: 'Inter, Arial',
                  fontSize: 18,
                  color: '#2C3E50',
                  marginBottom: 12,
                  paddingLeft: 12,
                  borderLeft: `2px solid ${content?.right_color || '#C0392B'}30`,
                  opacity: interpolate(frame, [10 + i * 5, 15 + i * 5], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// Main Composition
// ============================================================================

export const WeeklyReport: React.FC<WeeklyReportProps> = ({ specPath }) => {
  // In Remotion, props are passed as serialized data
  // The actual spec is loaded during bundling
  const videoProps = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      if (fs.existsSync(specPath)) {
        return JSON.parse(fs.readFileSync(specPath, 'utf-8')) as VideoProps;
      }
    } catch {
      // In browser preview, file reading won't work
    }

    // Fallback: empty spec
    return {
      spec: { meta: {}, slides: [] },
      timeline: [],
      totalFrames: 300,
      fps: 30,
      chartPaths: {},
    } as VideoProps;
  }, [specPath]);

  const { timeline, spec, chartPaths } = videoProps;
  const meta = spec?.meta || {};

  return (
    <AbsoluteFill style={{ backgroundColor: '#FFFFFF' }}>
      {timeline.map((entry, idx) => {
        const { slideType, startFrame, durationFrames, content, chartPath } = entry;

        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={durationFrames}
            name={`${slideType}-${idx}`}
          >
            <SlideWrapper durationFrames={durationFrames}>
              {slideType === 'cover' && (
                <CoverSlide content={content} meta={meta} />
              )}
              {slideType === 'section_divider' && (
                <SectionDivider content={content} />
              )}
              {(slideType === 'chart' || slideType === 'editorial') && (
                <ChartSlide
                  content={content}
                  chartPath={chartPath || chartPaths[String(entry.slideIndex)]}
                  isEditorial={slideType === 'editorial'}
                />
              )}
              {slideType === 'editorial' && !chartPath && (
                <EditorialSlide content={content} />
              )}
              {slideType === 'kpi_dashboard' && (
                <KPIDashboard content={content} />
              )}
              {slideType === 'text' && (
                <TextSlide content={content} meta={meta} />
              )}
              {slideType === 'back_cover' && (
                <BackCover content={content} meta={meta} />
              )}
              {/* Fallback for unhandled types */}
              {!['cover', 'section_divider', 'chart', 'editorial', 'kpi_dashboard', 'text', 'back_cover'].includes(slideType) && (
                <TextSlide content={content} meta={meta} />
              )}
            </SlideWrapper>
          </Sequence>
        );
      })}

      {/* Progress bar at bottom */}
      <ProgressBar totalFrames={videoProps.totalFrames} />
    </AbsoluteFill>
  );
};

// ============================================================================
// Progress Bar
// ============================================================================

const ProgressBar: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const progress = (frame / totalFrames) * 100;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: `${progress}%`,
        height: 3,
        background: '#E8792B',
        zIndex: 200,
        transition: 'width 0.1s linear',
      }}
    />
  );
};
