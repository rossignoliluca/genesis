/**
 * Genesis Video Composer — Animated Market Report Videos
 *
 * Converts PresentationSpec into an animated MP4 video using Remotion.
 * Chart reveals, section transitions, animated KPI counters.
 *
 * Usage:
 *   const composer = new VideoComposer(spec);
 *   const mp4Path = await composer.render('/tmp/weekly-report.mp4');
 */

import type { PresentationSpec, SlideSpec } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface VideoOptions {
  /** Output resolution width (default: 1920) */
  width?: number;
  /** Output resolution height (default: 1080) */
  height?: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Video codec (default: h264) */
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9';
  /** Quality CRF (default: 18, lower = better) */
  crf?: number;
  /** Chart PNG directory (reuse from PPTX render) */
  chartDir?: string;
  /** Include narration audio (future) */
  narration?: boolean;
}

export interface VideoResult {
  success: boolean;
  path?: string;
  duration: number;
  frames: number;
  error?: string;
}

interface SlideTimeline {
  slideIndex: number;
  slideType: string;
  startFrame: number;
  durationFrames: number;
  durationSeconds: number;
  chartPath?: string;
  content: any;
}

// ============================================================================
// Slide Duration Map (seconds)
// ============================================================================

const SLIDE_DURATIONS: Record<string, number> = {
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

// Transition duration between slides (frames at 30fps)
const TRANSITION_FRAMES = 15; // 0.5 seconds

// ============================================================================
// Timeline Builder
// ============================================================================

function buildTimeline(
  spec: PresentationSpec,
  chartPaths: Map<number, string>,
  fps: number,
): SlideTimeline[] {
  const timeline: SlideTimeline[] = [];
  let currentFrame = 0;

  for (let i = 0; i < spec.slides.length; i++) {
    const slide = spec.slides[i];
    const durSec = SLIDE_DURATIONS[slide.type] || 5;
    const durFrames = Math.round(durSec * fps);

    timeline.push({
      slideIndex: i,
      slideType: slide.type,
      startFrame: currentFrame,
      durationFrames: durFrames,
      durationSeconds: durSec,
      chartPath: chartPaths.get(i),
      content: slide.content,
    });

    currentFrame += durFrames;
  }

  return timeline;
}

// ============================================================================
// Video Composer
// ============================================================================

export class VideoComposer {
  private spec: PresentationSpec;
  private chartPaths: Map<number, string>;

  constructor(spec: PresentationSpec, chartPaths?: Map<number, string>) {
    this.spec = spec;
    this.chartPaths = chartPaths || new Map();
  }

  /**
   * Set chart paths from Phase 1 rendering.
   */
  setChartPaths(paths: Record<number, string>): void {
    for (const [idx, p] of Object.entries(paths)) {
      this.chartPaths.set(Number(idx), p);
    }
  }

  /**
   * Render the video. Uses Remotion's programmatic API.
   */
  async render(outputPath: string, opts: VideoOptions = {}): Promise<VideoResult> {
    const startTime = Date.now();
    const fps = opts.fps || 30;
    const width = opts.width || 1920;
    const height = opts.height || 1080;
    const crf = opts.crf || 18;

    try {
      // Build timeline
      const timeline = buildTimeline(this.spec, this.chartPaths, fps);
      const totalFrames = timeline.reduce((sum, s) => sum + s.durationFrames, 0);
      const totalDuration = totalFrames / fps;

      // Write timeline + spec as props file for Remotion
      const propsDir = path.dirname(outputPath);
      fs.mkdirSync(propsDir, { recursive: true });
      const propsPath = path.join(propsDir, 'video-props.json');
      fs.writeFileSync(propsPath, JSON.stringify({
        spec: this.spec,
        timeline,
        totalFrames,
        fps,
        chartPaths: Object.fromEntries(this.chartPaths),
      }, null, 2));

      // Use Remotion's programmatic renderer
      const { bundle } = await import('@remotion/bundler');
      const { renderMedia, selectComposition } = await import('@remotion/renderer');

      const compositionRoot = path.resolve(__dirname, 'Root.tsx');

      // Bundle the Remotion project
      const bundleLocation = await bundle({
        entryPoint: compositionRoot,
        onProgress: (progress: number) => {
          if (progress % 25 === 0) {
            console.log(`  [video] Bundling: ${progress}%`);
          }
        },
      });

      // Select the composition
      const inputProps = {
        specPath: propsPath,
      };

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'WeeklyReport',
        inputProps,
      });

      // Render the video
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: opts.codec === 'h265' ? 'h265' : 'h264',
        outputLocation: outputPath,
        inputProps,
        crf,
        onProgress: ({ progress }: { progress: number }) => {
          const pct = Math.round(progress * 100);
          if (pct % 10 === 0) {
            console.log(`  [video] Rendering: ${pct}%`);
          }
        },
      });

      return {
        success: true,
        path: outputPath,
        duration: Date.now() - startTime,
        frames: totalFrames,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
        duration: Date.now() - startTime,
        frames: 0,
      };
    }
  }

  /**
   * Get estimated video duration in seconds.
   */
  getEstimatedDuration(fps = 30): number {
    const timeline = buildTimeline(this.spec, this.chartPaths, fps);
    return timeline.reduce((sum, s) => sum + s.durationSeconds, 0);
  }
}
