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
  | 'donut_matrix'
  | 'waterfall'
  | 'return_quilt'
  | 'scatter'
  | 'sparkline_table'
  | 'lollipop'
  | 'dumbbell'
  | 'area'
  | 'bump'
  | 'small_multiples';

// --- New chart data interfaces (v16.5) ---

export interface ShadedRegion {
  start: number;
  end: number;
  label?: string;
  color?: string;
}

export interface LineDataAnnotation {
  x: number;
  y: number;
  text: string;
  arrow?: boolean;
}

export interface ReturnQuiltData {
  years: string[];
  assets: string[];
  returns: number[][];
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  size?: number;
  color?: string;
}

export interface ScatterData {
  points: ScatterPoint[];
  x_label?: string;
  y_label?: string;
  quadrant_labels?: { tl?: string; tr?: string; bl?: string; br?: string };
  trend_line?: boolean;
}

export interface SparklineRow {
  cells: string[];
  sparkline: number[];
}

export interface SparklineTableData {
  headers: string[];
  rows: SparklineRow[];
}

export interface LollipopData {
  categories: string[];
  values: number[];
}

export interface DumbbellData {
  categories: string[];
  start: number[];
  end: number[];
  start_label?: string;
  end_label?: string;
}

export interface AreaSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface AreaData {
  labels: string[];
  series: AreaSeries[];
}

export interface BumpSeries {
  name: string;
  ranks: number[];
  color?: string;
}

export interface BumpData {
  periods: string[];
  series: BumpSeries[];
}

export interface SmallMultiplesPanel {
  title: string;
  labels: string[];
  values: number[];
}

export interface SmallMultiplesData {
  panels: SmallMultiplesPanel[];
}

export interface WaterfallData {
  labels: string[];
  values: number[];
  is_total?: boolean[];
}

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

export interface EditorialContent {
  section?: string;
  hashtags?: string;
  commentary?: string;
  title?: string;
  image_path?: string;
  source?: string;
  source_url?: string;
  chart_dims?: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
}

export interface QuoteSlideContent {
  quote: string;
  attribution?: string;
  source?: string;
  section?: string;
  highlight?: boolean;
  commentary?: string;
}

export interface ChartGridItem {
  label?: string;
  image_path?: string;
}

export interface ChartGridContent {
  title?: string;
  section?: string;
  hashtags?: string;
  grid?: ChartGridItem[];
  cols?: number;
  source?: string;
}

export interface SectionDividerContent {
  title?: string;
  subtitle?: string;
  section?: string;
  section_num?: string;
}

export type SlideType =
  | 'cover'
  | 'executive_summary'
  | 'text'
  | 'chart'
  | 'sources'
  | 'back_cover'
  | 'section_divider'
  | 'kpi_dashboard'
  | 'news'
  | 'image'
  | 'dual_chart'
  | 'callout'
  | 'editorial'
  | 'quote_slide'
  | 'chart_grid';

export interface SlideSpec {
  type: SlideType;
  content: CoverContent | ExecSummaryContent | ChartSlideContent | TextSlideContent | SourcesSlideContent | BackCoverContent | EditorialContent | QuoteSlideContent | ChartGridContent | SectionDividerContent;
  chart?: ChartSpec;
  charts?: ChartSpec[];
  chart_num?: number;
  bg_image?: string;
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
  mode?: 'editorial' | 'standard';
  logo_path?: string;
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
