/**
 * spec-to-timeline — Maps PresentationSpec → frame durations per slide.
 *
 * Used by both the VideoComposer and the Remotion compositions.
 */

import type { PresentationSpec, SlideSpec } from '../../types.js';

export interface TimelineEntry {
  slideIndex: number;
  slideType: string;
  startFrame: number;
  durationFrames: number;
  durationSeconds: number;
}

/** Default duration per slide type (seconds) */
const DURATIONS: Record<string, number> = {
  cover: 4,
  section_divider: 3,
  executive_summary: 7,
  chart: 6,
  editorial: 8,
  text: 5,
  kpi_dashboard: 5,
  dual_chart: 7,
  callout: 4,
  quote_slide: 4,
  news: 6,
  image: 5,
  sources: 4,
  back_cover: 3,
  chart_grid: 7,
};

/**
 * Convert a PresentationSpec into a timeline of slide entries.
 */
export function specToTimeline(
  spec: PresentationSpec,
  fps = 30,
  overrides?: Record<string, number>,
): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let currentFrame = 0;
  const durMap = { ...DURATIONS, ...overrides };

  for (let i = 0; i < spec.slides.length; i++) {
    const slide = spec.slides[i];
    const durSec = durMap[slide.type] || 5;
    const durFrames = Math.round(durSec * fps);

    timeline.push({
      slideIndex: i,
      slideType: slide.type,
      startFrame: currentFrame,
      durationFrames: durFrames,
      durationSeconds: durSec,
    });

    currentFrame += durFrames;
  }

  return timeline;
}

/**
 * Get total video duration in seconds.
 */
export function getTotalDuration(spec: PresentationSpec, fps = 30): number {
  const timeline = specToTimeline(spec, fps);
  const lastEntry = timeline[timeline.length - 1];
  if (!lastEntry) return 0;
  return (lastEntry.startFrame + lastEntry.durationFrames) / fps;
}
