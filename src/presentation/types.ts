/**
 * Genesis Presentation Engine — TypeScript Types
 *
 * Shared type definitions for the presentation generation system.
 * These types mirror the JSON schema expected by the Python engine.
 */

// ============================================================================
// Design Types
// ============================================================================

export interface DesignSpec {
  navy?: string;
  gold?: string;
  white?: string;
  chart_primary?: string;
  chart_secondary?: string;
  green?: string;
  red?: string;
  orange?: string;
  body_text?: string;
  gray?: string;
  source_color?: string;
  light_gray?: string;
  chart_bg?: string;
  extra_colors?: string[];
}

// ============================================================================
// Chart Types
// ============================================================================

export interface ChartAnnotation {
  text: string;
  xy: [number, number];
  xytext?: [number, number];
  color?: string;
  fontsize?: number;
  fontweight?: string;
  arrow?: boolean;
  box?: boolean;
  box_bg?: string;
}

export interface ChartVLine {
  x: number;
  color?: string;
  style?: string;
  label?: string;
}

export interface ChartHLine {
  y: number;
  color?: string;
  style?: string;
  label?: string;
}

export interface LineSeries {
  name: string;
  values: number[];
  color?: string;
  linestyle?: string;
  linewidth?: number;
}

export interface BarGroup {
  name: string;
  values: number[];
  color?: string;
}

export interface StackedBarStack {
  name: string;
  values: number[];
  color?: string;
}

export interface GaugeZone {
  start: number;
  end: number;
  label?: string;
  color?: string;
  border?: string;
}

export interface DonutData {
  labels: string[];
  sizes: number[];
  colors?: string[];
  center_text?: string;
}

export interface MatrixData {
  headers: string[];
  rows: string[][];
}

export interface ContextBox {
  text: string;
  x?: number;
  y?: number;
  border_color?: string;
  bg_color?: string;
}

export type ChartType =
  | 'line'
  | 'bar'
  | 'hbar'
  | 'stacked_bar'
  | 'table_heatmap'
  | 'gauge'
  | 'donut_matrix';

export interface ChartSpec {
  type: ChartType;
  data: Record<string, unknown>;
  config?: Record<string, unknown>;
  source?: string;
  filename?: string;
}

// ============================================================================
// Slide Types
// ============================================================================

export interface CoverContent {
  company?: string;
  tagline?: string;
  headline?: string;
  subheadline?: string;
  date_range?: string;
  theme?: string;
  footer_text?: string;
}

export interface ExecSummarySection {
  label: string;
  text: string;
  color?: string;
  height?: number;
}

export interface ExecSummaryContent {
  title: string;
  tag?: string;
  sections: ExecSummarySection[];
}

export interface ChartSlideContent {
  title: string;
  tag?: string;
  chart_dims?: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
}

export interface TextSlideContent {
  title: string;
  tag?: string;
  left_title?: string;
  left_color?: string;
  left_items?: string[];
  left_icon?: string;
  right_title?: string;
  right_color?: string;
  right_items?: string[];
  right_icon?: string;
}

export interface SourcesSlideContent {
  title?: string;
  left_sources?: string;
  right_sources?: string;
  disclaimer?: string;
}

export interface BackCoverContent {
  company?: string;
  tagline?: string;
  contact_lines?: string[];
  closing?: string;
  regulatory?: string;
  copyright?: string;
}

export type SlideType = 'cover' | 'executive_summary' | 'chart' | 'text' | 'sources' | 'back_cover';

export interface SlideSpec {
  type: SlideType;
  content: CoverContent | ExecSummaryContent | ChartSlideContent | TextSlideContent | SourcesSlideContent | BackCoverContent;
  chart?: ChartSpec;
  chart_num?: number;
}

// ============================================================================
// Presentation Spec (top-level)
// ============================================================================

export interface PresentationMeta {
  title?: string;
  company?: string;
  date?: string;
  header_tag?: string;
  footer_left?: string;
  footer_center?: string;
  palette?: string;
  slide_width?: number;
  slide_height?: number;
}

export interface PresentationSpec {
  meta: PresentationMeta;
  design?: DesignSpec;
  slides: SlideSpec[];
  output_path: string;
  chart_dir?: string;
}

// ============================================================================
// Result Types
// ============================================================================

export interface PresentationResult {
  success: boolean;
  path?: string;
  slides: number;
  charts: number;
  error?: string;
  duration: number;
}

// ============================================================================
// Memory Record
// ============================================================================

export interface PresentationMemoryRecord {
  topic: string;
  slides: number;
  charts: number;
  outputPath: string;
  specSnapshot: PresentationSpec;
  generatedAt: string;
  feedback?: string;
  rating?: number;
}
