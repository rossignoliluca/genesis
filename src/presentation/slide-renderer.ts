/**
 * Genesis Presentation Engine — HTML→Screenshot Slide Renderer
 *
 * Renders each slide as a self-contained HTML page, then screenshots
 * via Playwright at 2x resolution for pixel-perfect PPTX embedding.
 *
 * This is how Goldman/JPM do it internally — web fonts (Inter, DM Sans),
 * CSS gradients, glassmorphism, all rendered at retina quality.
 *
 * Integration:
 *   spec.meta.render_mode = 'html-screenshot' → uses this renderer
 *   Default pipeline still uses Python engine (backward-compatible)
 */

import type {
  PresentationSpec,
  PresentationMeta,
  SlideSpec,
  ChartSpec,
} from './types.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface SlideRenderResult {
  slidePaths: string[];
  htmlPaths: string[];
  duration: number;
}

interface SlideColors {
  navy: string;
  gold: string;
  white: string;
  orange: string;
  chartPrimary: string;
  chartSecondary: string;
  green: string;
  red: string;
  bodyText: string;
  gray: string;
  lightGray: string;
  cardBg: string;
  cardBorder: string;
  slideBg: string;
  titleColor: string;
  sourceColor: string;
}

// ============================================================================
// Palette Mapping
// ============================================================================

const EDITORIAL_COLORS: SlideColors = {
  navy: '#2C3E50',
  gold: '#E8792B',
  white: '#FFFFFF',
  orange: '#E8792B',
  chartPrimary: '#2C3E50',
  chartSecondary: '#4A90D9',
  green: '#27AE60',
  red: '#C0392B',
  bodyText: '#2C3E50',
  gray: '#6B7B8D',
  lightGray: '#D5D8DC',
  cardBg: '#FFFFFF',
  cardBorder: '#E0E0E0',
  slideBg: '#FFFFFF',
  titleColor: '#E8792B',
  sourceColor: '#8899AA',
};

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

function getColors(meta: PresentationMeta): SlideColors {
  // For now, always use editorial palette
  return EDITORIAL_COLORS;
}

// ============================================================================
// CSS Base
// ============================================================================

function baseCSS(c: SlideColors): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  background: ${c.slideBg};
  color: ${c.bodyText};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.slide {
  width: 1920px;
  height: 1080px;
  position: relative;
  overflow: hidden;
  padding: 0;
}

/* Editorial accent line */
.accent-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  background: ${c.orange};
}

/* Header tag */
.header-tag {
  position: absolute;
  top: 18px;
  left: 86px;
  right: 86px;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: ${c.gray};
  letter-spacing: 1.5px;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-tag .page-num {
  font-size: 12px;
  color: ${c.sourceColor};
}

/* Section badge */
.section-badge {
  display: inline-block;
  padding: 4px 16px;
  border-radius: 3px;
  font-family: 'DM Sans', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: white;
}

/* Footer */
.footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  border-top: 1px solid ${c.lightGray};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 86px;
  font-size: 11px;
  color: ${c.gray};
}

.footer .brand {
  font-family: 'DM Sans', sans-serif;
  font-weight: 700;
  color: ${c.navy};
}

/* Typography */
h1 {
  font-family: 'DM Sans', sans-serif;
  font-weight: 700;
  line-height: 1.15;
}

h2 {
  font-family: 'DM Sans', sans-serif;
  font-weight: 700;
  line-height: 1.2;
}

h3 {
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
}

p, li {
  font-family: 'Inter', sans-serif;
  line-height: 1.6;
}

.source-text {
  font-size: 11px;
  color: ${c.sourceColor};
  font-style: italic;
}

/* Chart image */
.chart-img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* KPI card */
.kpi-card {
  background: ${c.cardBg};
  border: 1px solid ${c.cardBorder};
  border-radius: 8px;
  padding: 24px 28px;
  text-align: center;
}

.kpi-card .value {
  font-family: 'DM Sans', sans-serif;
  font-size: 42px;
  font-weight: 700;
  line-height: 1.1;
}

.kpi-card .label {
  font-size: 13px;
  color: ${c.gray};
  margin-top: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-card .delta {
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
}

.kpi-card .delta.positive { color: ${c.green}; }
.kpi-card .delta.negative { color: ${c.red}; }

/* Glassmorphism card */
.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 32px;
}
`;
}

// ============================================================================
// Slide HTML Generators
// ============================================================================

function wrapSlide(innerHtml: string, c: SlideColors, meta: PresentationMeta, pageNum?: number): string {
  const headerTag = meta.header_tag || '';
  const footerLeft = meta.footer_left || meta.company || 'Rossignoli & Partners';
  const footerCenter = meta.footer_center || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1920,height=1080">
  <style>${baseCSS(c)}</style>
</head>
<body>
<div class="slide">
  <div class="accent-line"></div>
  ${headerTag ? `<div class="header-tag">
    <span>${headerTag}</span>
    ${pageNum ? `<span class="page-num">${pageNum}</span>` : ''}
  </div>` : ''}
  ${innerHtml}
  <div class="footer">
    <span class="brand">${footerLeft}</span>
    <span>${footerCenter}</span>
    <span>${meta.date || ''}</span>
  </div>
</div>
</body>
</html>`;
}

function renderCoverHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta): string {
  const content = slide.content as any;
  const company = content.company || meta.company || 'Rossignoli & Partners';
  const headline = content.headline || meta.title || '';
  const subheadline = content.subheadline || content.tagline || '';
  const dateRange = content.date_range || meta.date || '';
  const theme = content.theme || '';
  const bgImage = content.background_image || '';

  const coverBg = bgImage
    ? `background: linear-gradient(135deg, rgba(44,62,80,0.85) 0%, rgba(26,37,47,0.9) 50%, rgba(44,62,80,0.85) 100%), url('file://${bgImage}') center/cover no-repeat;`
    : `background: linear-gradient(135deg, ${c.navy} 0%, #1a252f 50%, ${c.navy} 100%);`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${baseCSS(c)}
  .cover {
    width: 1920px; height: 1080px;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    ${coverBg}
    color: white; text-align: center; position: relative;
  }
  .cover .accent-bar {
    position: absolute; top: 0; left: 0; right: 0; height: 8px;
    background: ${c.orange};
  }
  .cover .company {
    font-family: 'DM Sans', sans-serif; font-size: 18px;
    font-weight: 500; letter-spacing: 4px; text-transform: uppercase;
    color: rgba(255,255,255,0.7); margin-bottom: 32px;
  }
  .cover h1 {
    font-size: 64px; max-width: 1400px; color: white;
    margin-bottom: 24px;
  }
  .cover .subheadline {
    font-size: 22px; color: rgba(255,255,255,0.8);
    max-width: 900px; margin-bottom: 40px;
    font-family: 'Inter', sans-serif; font-weight: 300;
  }
  .cover .date-badge {
    display: inline-block; padding: 10px 32px;
    border: 2px solid ${c.orange}; border-radius: 4px;
    font-family: 'DM Sans', sans-serif; font-size: 15px;
    font-weight: 500; letter-spacing: 1px; color: ${c.orange};
  }
  .cover .theme {
    position: absolute; bottom: 80px;
    font-size: 13px; color: rgba(255,255,255,0.5);
    letter-spacing: 2px; text-transform: uppercase;
  }
  </style>
</head>
<body>
<div class="cover">
  <div class="accent-bar"></div>
  <div class="company">${company}</div>
  <h1>${headline}</h1>
  ${subheadline ? `<div class="subheadline">${subheadline}</div>` : ''}
  ${dateRange ? `<div class="date-badge">${dateRange}</div>` : ''}
  ${theme ? `<div class="theme">${theme}</div>` : ''}
</div>
</body>
</html>`;
}

function renderExecSummaryHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || 'Executive Summary';
  const sections = content.sections || [];

  const sectionsHtml = sections.map((s: any) => {
    const color = s.color || c.chartPrimary;
    return `
    <div style="margin-bottom: 20px; padding: 20px 24px; border-left: 4px solid ${color}; background: #FAFBFC; border-radius: 0 8px 8px 0;">
      <div style="font-family: 'DM Sans'; font-weight: 700; font-size: 14px; color: ${color}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
        ${s.label}
      </div>
      <div style="font-size: 15px; line-height: 1.6; color: ${c.bodyText};">
        ${s.text}
      </div>
    </div>`;
  }).join('\n');

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px; bottom: 60px;">
      <h2 style="font-size: 32px; color: ${c.titleColor}; margin-bottom: 28px;">${title}</h2>
      <div style="columns: 2; column-gap: 40px;">
        ${sectionsHtml}
      </div>
    </div>
  `, c, meta, pageNum);
}

function renderChartSlideHTML(slide: SlideSpec, chartPath: string | undefined, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || '';
  const tag = content.tag || '';

  let chartHtml = '';
  if (chartPath && existsSync(chartPath)) {
    const imgData = readFileSync(chartPath).toString('base64');
    chartHtml = `<img class="chart-img" src="data:image/png;base64,${imgData}" style="width: 100%; height: auto; max-height: 680px; object-fit: contain;" />`;
  }

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px;">
      ${tag ? `<div style="font-size: 11px; color: ${c.gray}; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">${tag}</div>` : ''}
      <h2 style="font-size: 28px; color: ${c.titleColor}; margin-bottom: 20px;">${title}</h2>
    </div>
    <div style="position: absolute; top: 160px; left: 86px; right: 86px; bottom: 70px; display: flex; align-items: center; justify-content: center;">
      ${chartHtml}
    </div>
  `, c, meta, pageNum);
}

function renderEditorialHTML(slide: SlideSpec, chartPath: string | undefined, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const section = content.section || '';
  const hashtags = content.hashtags || '';
  const commentary = content.commentary || '';
  const title = content.title || '';
  const source = content.source || '';
  const badgeColor = SECTION_BADGE_COLORS[section.toLowerCase().replace(/\s+/g, '_')] || c.gray;

  let chartHtml = '';
  // Support image_path in editorial content (for web screenshots)
  const imagePath = content.image_path;
  if (imagePath && existsSync(imagePath)) {
    const imgData = readFileSync(imagePath).toString('base64');
    const ext = path.extname(imagePath).slice(1) || 'png';
    chartHtml = `<img src="data:image/${ext};base64,${imgData}" style="width: 100%; height: auto; max-height: 560px; object-fit: contain; border-radius: 4px;" />`;
  } else if (chartPath && existsSync(chartPath)) {
    const imgData = readFileSync(chartPath).toString('base64');
    chartHtml = `<img src="data:image/png;base64,${imgData}" style="width: 100%; height: auto; max-height: 560px; object-fit: contain; border-radius: 4px;" />`;
  }

  return wrapSlide(`
    <div style="position: absolute; top: 55px; left: 86px; right: 86px;">
      ${section ? `<span class="section-badge" style="background: ${badgeColor};">${section}</span>` : ''}
      ${hashtags ? `<span style="margin-left: 12px; font-size: 12px; color: ${c.sourceColor};">${hashtags}</span>` : ''}
    </div>
    <div style="position: absolute; top: 100px; left: 86px; right: 86px;">
      ${title ? `<h2 style="font-size: 26px; color: ${c.titleColor}; margin-bottom: 12px;">${title}</h2>` : ''}
      ${commentary ? `<p style="font-size: 14px; color: ${c.bodyText}; line-height: 1.7; max-width: 1600px;">${commentary}</p>` : ''}
    </div>
    <div style="position: absolute; top: 220px; left: 86px; right: 86px; bottom: 80px; display: flex; align-items: center; justify-content: center;">
      ${chartHtml}
    </div>
    ${source ? `<div class="source-text" style="position: absolute; bottom: 60px; left: 86px;">${source}</div>` : ''}
  `, c, meta, pageNum);
}

function renderTextSlideHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || '';

  const renderColumn = (colTitle: string, items: string[], color: string, icon?: string) => {
    if (!items || items.length === 0) return '';
    const itemsHtml = items.map(item =>
      `<li style="margin-bottom: 10px; padding-left: 8px; font-size: 14px;">${item}</li>`
    ).join('\n');
    return `
      <div style="flex: 1; padding: 0 20px;">
        <h3 style="font-size: 18px; color: ${color}; margin-bottom: 16px; border-bottom: 2px solid ${color}; padding-bottom: 8px;">
          ${icon ? icon + ' ' : ''}${colTitle}
        </h3>
        <ul style="list-style: none; padding: 0;">${itemsHtml}</ul>
      </div>`;
  };

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px;">
      <h2 style="font-size: 32px; color: ${c.titleColor}; margin-bottom: 32px;">${title}</h2>
    </div>
    <div style="position: absolute; top: 140px; left: 86px; right: 86px; display: flex; gap: 40px;">
      ${renderColumn(content.left_title || '', content.left_items || [], content.left_color || c.green, content.left_icon)}
      ${renderColumn(content.right_title || '', content.right_items || [], content.right_color || c.red, content.right_icon)}
    </div>
  `, c, meta, pageNum);
}

function renderSectionDividerHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta): string {
  const content = slide.content as any;
  const title = content.title || '';
  const subtitle = content.subtitle || '';
  const sectionNum = content.section_num || '';
  const bgImage = content.background_image || '';

  const dividerBg = bgImage
    ? `background: linear-gradient(135deg, rgba(44,62,80,0.82) 0%, rgba(26,37,47,0.88) 100%), url('file://${bgImage}') center/cover no-repeat;`
    : `background: linear-gradient(135deg, ${c.navy} 0%, #1a252f 100%);`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${baseCSS(c)}
  .divider {
    width: 1920px; height: 1080px;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    ${dividerBg}
    color: white; text-align: center; position: relative;
  }
  .divider .accent-bar {
    position: absolute; top: 0; left: 0; right: 0; height: 6px;
    background: ${c.orange};
  }
  .divider .num {
    font-family: 'DM Sans'; font-size: 120px; font-weight: 700;
    color: rgba(255,255,255,0.08); position: absolute;
    top: 50%; left: 50%; transform: translate(-50%, -60%);
  }
  .divider h1 { font-size: 52px; color: white; z-index: 1; }
  .divider .sub { font-size: 18px; color: rgba(255,255,255,0.6); margin-top: 16px; z-index: 1; }
  </style>
</head>
<body>
<div class="divider">
  <div class="accent-bar"></div>
  ${sectionNum ? `<div class="num">${sectionNum}</div>` : ''}
  <h1>${title}</h1>
  ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}
</div>
</body>
</html>`;
}

function renderKPIDashboardHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || 'Key Performance Indicators';
  const kpis = content.kpis || [];

  const cols = Math.min(kpis.length, 4);
  const kpiHtml = kpis.map((kpi: any) => {
    const deltaClass = kpi.delta?.startsWith('+') ? 'positive' : kpi.delta?.startsWith('-') ? 'negative' : '';
    const valueColor = kpi.color || c.navy;
    return `
      <div class="kpi-card" style="flex: 1;">
        <div class="value" style="color: ${valueColor};">${kpi.value}</div>
        <div class="label">${kpi.label}</div>
        ${kpi.delta ? `<div class="delta ${deltaClass}">${kpi.delta}</div>` : ''}
      </div>`;
  }).join('\n');

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px;">
      <h2 style="font-size: 32px; color: ${c.titleColor}; margin-bottom: 40px;">${title}</h2>
    </div>
    <div style="position: absolute; top: 160px; left: 86px; right: 86px; display: flex; gap: 24px; flex-wrap: wrap;">
      ${kpiHtml}
    </div>
  `, c, meta, pageNum);
}

function renderSourcesHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || 'Sources & Disclosures';
  const leftSources = content.left_sources || '';
  const rightSources = content.right_sources || '';
  const disclaimer = content.disclaimer || '';

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px; bottom: 70px;">
      <h2 style="font-size: 28px; color: ${c.titleColor}; margin-bottom: 24px;">${title}</h2>
      <div style="display: flex; gap: 40px;">
        <div style="flex: 1; font-size: 11px; color: ${c.gray}; line-height: 1.8; white-space: pre-wrap;">${leftSources}</div>
        <div style="flex: 1; font-size: 11px; color: ${c.gray}; line-height: 1.8; white-space: pre-wrap;">${rightSources}</div>
      </div>
      ${disclaimer ? `<div style="margin-top: 24px; padding: 16px; background: #FAFBFC; border-radius: 8px; font-size: 10px; color: ${c.gray}; line-height: 1.6;">${disclaimer}</div>` : ''}
    </div>
  `, c, meta, pageNum);
}

function renderBackCoverHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta): string {
  const content = slide.content as any;
  const company = content.company || meta.company || 'Rossignoli & Partners';
  const tagline = content.tagline || '';
  const contactLines = content.contact_lines || [];
  const closing = content.closing || 'Thank you';
  const regulatory = content.regulatory || '';

  const contactHtml = contactLines.map((line: string) =>
    `<div style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 4px;">${line}</div>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${baseCSS(c)}
  .back-cover {
    width: 1920px; height: 1080px;
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    background: linear-gradient(135deg, ${c.navy} 0%, #1a252f 100%);
    color: white; text-align: center; position: relative;
  }
  .back-cover .accent-bar {
    position: absolute; bottom: 0; left: 0; right: 0; height: 6px;
    background: ${c.orange};
  }
  </style>
</head>
<body>
<div class="back-cover">
  <div style="font-size: 42px; font-family: 'DM Sans'; font-weight: 700; margin-bottom: 16px;">${closing}</div>
  <div style="font-size: 20px; font-family: 'DM Sans'; font-weight: 500; color: ${c.orange}; margin-bottom: 32px;">${company}</div>
  ${tagline ? `<div style="font-size: 15px; color: rgba(255,255,255,0.6); margin-bottom: 24px;">${tagline}</div>` : ''}
  <div style="margin-bottom: 32px;">${contactHtml}</div>
  ${regulatory ? `<div style="max-width: 800px; font-size: 9px; color: rgba(255,255,255,0.4); line-height: 1.5;">${regulatory}</div>` : ''}
  <div class="accent-bar"></div>
</div>
</body>
</html>`;
}

function renderCalloutHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || '';
  const text = content.text || content.body || '';
  const icon = content.icon || '';
  const color = content.color || c.orange;

  return wrapSlide(`
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; max-width: 1200px;">
      ${icon ? `<div style="font-size: 64px; margin-bottom: 24px;">${icon}</div>` : ''}
      <h2 style="font-size: 36px; color: ${color}; margin-bottom: 20px;">${title}</h2>
      <p style="font-size: 18px; color: ${c.bodyText}; line-height: 1.7;">${text}</p>
    </div>
  `, c, meta, pageNum);
}

function renderQuoteSlideHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const quote = content.quote || '';
  const attribution = content.attribution || '';
  const section = content.section || '';
  const badgeColor = SECTION_BADGE_COLORS[section.toLowerCase().replace(/\s+/g, '_')] || c.gray;

  return wrapSlide(`
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; max-width: 1200px;">
      ${section ? `<span class="section-badge" style="background: ${badgeColor}; margin-bottom: 24px; display: inline-block;">${section}</span>` : ''}
      <div style="font-size: 80px; color: ${c.orange}; font-family: Georgia, serif; line-height: 0.5; margin-bottom: 20px;">&ldquo;</div>
      <blockquote style="font-family: 'DM Sans'; font-size: 26px; font-weight: 500; color: ${c.navy}; line-height: 1.5; font-style: italic;">
        ${quote}
      </blockquote>
      ${attribution ? `<div style="margin-top: 24px; font-size: 14px; color: ${c.gray};">&mdash; ${attribution}</div>` : ''}
    </div>
  `, c, meta, pageNum);
}

function renderNewsSlideHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || 'News & Events';
  const items = content.items || content.news || [];

  const itemsHtml = items.map((item: any) => `
    <div style="padding: 16px 20px; border-left: 3px solid ${item.color || c.orange}; background: #FAFBFC; border-radius: 0 6px 6px 0; margin-bottom: 12px;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${item.headline || item.title || ''}</div>
      <div style="font-size: 12px; color: ${c.gray};">${item.summary || item.text || ''}</div>
    </div>
  `).join('\n');

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px; bottom: 70px;">
      <h2 style="font-size: 28px; color: ${c.titleColor}; margin-bottom: 24px;">${title}</h2>
      <div style="columns: 2; column-gap: 32px;">
        ${itemsHtml}
      </div>
    </div>
  `, c, meta, pageNum);
}

function renderDualChartHTML(slide: SlideSpec, chartPaths: string[], c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || '';

  const chartsHtml = chartPaths.map((cp, i) => {
    if (cp && existsSync(cp)) {
      const imgData = readFileSync(cp).toString('base64');
      return `<div style="flex: 1;"><img src="data:image/png;base64,${imgData}" style="width: 100%; height: auto; max-height: 600px; object-fit: contain; border-radius: 4px;" /></div>`;
    }
    return `<div style="flex: 1; background: #FAFBFC; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: ${c.gray};">Chart ${i + 1}</div>`;
  }).join('\n');

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px;">
      <h2 style="font-size: 28px; color: ${c.titleColor}; margin-bottom: 20px;">${title}</h2>
    </div>
    <div style="position: absolute; top: 140px; left: 86px; right: 86px; bottom: 70px; display: flex; gap: 32px; align-items: center;">
      ${chartsHtml}
    </div>
  `, c, meta, pageNum);
}

function renderImageSlideHTML(slide: SlideSpec, c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || '';
  const imagePath = content.image_path || '';

  let imgHtml = '';
  if (imagePath && existsSync(imagePath)) {
    const imgData = readFileSync(imagePath).toString('base64');
    const ext = path.extname(imagePath).slice(1) || 'png';
    imgHtml = `<img src="data:image/${ext};base64,${imgData}" style="max-width: 100%; max-height: 750px; object-fit: contain; border-radius: 8px;" />`;
  }

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px;">
      <h2 style="font-size: 28px; color: ${c.titleColor}; margin-bottom: 20px;">${title}</h2>
    </div>
    <div style="position: absolute; top: 130px; left: 86px; right: 86px; bottom: 70px; display: flex; align-items: center; justify-content: center;">
      ${imgHtml}
    </div>
  `, c, meta, pageNum);
}

function renderChartGridHTML(slide: SlideSpec, chartPaths: string[], c: SlideColors, meta: PresentationMeta, pageNum: number): string {
  const content = slide.content as any;
  const title = content.title || '';
  const cols = content.cols || 2;
  const grid = content.grid || [];

  // Support both chartPaths (from Plotly) and grid[].image_path (from web screenshots)
  const cellsHtml = grid.map((item: any, i: number) => {
    const label = item?.label || '';
    const itemImagePath = item?.image_path;
    const cp = chartPaths[i];
    let imgHtml = '';
    if (itemImagePath && existsSync(itemImagePath)) {
      const imgData = readFileSync(itemImagePath).toString('base64');
      const ext = path.extname(itemImagePath).slice(1) || 'png';
      imgHtml = `<img src="data:image/${ext};base64,${imgData}" style="width: 100%; height: auto; max-height: 420px; object-fit: contain; border-radius: 4px;" />`;
    } else if (cp && existsSync(cp)) {
      const imgData = readFileSync(cp).toString('base64');
      imgHtml = `<img src="data:image/png;base64,${imgData}" style="width: 100%; height: auto; max-height: 420px; object-fit: contain; border-radius: 4px;" />`;
    }
    return `
      <div style="flex: 0 0 calc(${100 / cols}% - 16px);">
        ${label ? `<div style="font-size: 12px; font-weight: 600; color: ${c.navy}; margin-bottom: 8px;">${label}</div>` : ''}
        ${imgHtml}
      </div>`;
  }).join('\n');

  return wrapSlide(`
    <div style="position: absolute; top: 60px; left: 86px; right: 86px;">
      <h2 style="font-size: 28px; color: ${c.titleColor}; margin-bottom: 20px;">${title}</h2>
    </div>
    <div style="position: absolute; top: 130px; left: 86px; right: 86px; bottom: 70px; display: flex; flex-wrap: wrap; gap: 16px; align-content: start;">
      ${cellsHtml}
    </div>
  `, c, meta, pageNum);
}

// ============================================================================
// Main Renderer
// ============================================================================

export class SlideRenderer {
  private colors: SlideColors;
  private meta: PresentationMeta;
  private chartPaths: Map<number, string>;

  constructor(
    private spec: PresentationSpec,
    chartPaths?: Map<number, string>,
  ) {
    this.meta = spec.meta;
    this.colors = getColors(spec.meta);
    this.chartPaths = chartPaths || new Map();
  }

  /**
   * Set the chart PNG path for a specific slide index.
   * Call this after rendering charts with Plotly engine.
   */
  setChartPath(slideIndex: number, chartPath: string): void {
    this.chartPaths.set(slideIndex, chartPath);
  }

  /**
   * Set all chart paths from a record of slideIndex → path.
   */
  setChartPaths(paths: Record<number, string>): void {
    for (const [idx, p] of Object.entries(paths)) {
      this.chartPaths.set(Number(idx), p);
    }
  }

  /**
   * Generate HTML for all slides and return file paths.
   * Does NOT screenshot — call screenshotSlides() separately.
   */
  generateHTML(outputDir: string): string[] {
    mkdirSync(outputDir, { recursive: true });
    const htmlPaths: string[] = [];
    let pageNum = 0;

    for (let i = 0; i < this.spec.slides.length; i++) {
      const slide = this.spec.slides[i];
      const slideType = slide.type;
      let html = '';

      // Track page numbers (covers and dividers don't count)
      if (!['cover', 'section_divider', 'back_cover'].includes(slideType)) {
        pageNum++;
      }

      const chartPath = this.chartPaths.get(i);

      switch (slideType) {
        case 'cover':
          html = renderCoverHTML(slide, this.colors, this.meta);
          break;
        case 'executive_summary':
          html = renderExecSummaryHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'chart':
          html = renderChartSlideHTML(slide, chartPath, this.colors, this.meta, pageNum);
          break;
        case 'editorial':
          html = renderEditorialHTML(slide, chartPath, this.colors, this.meta, pageNum);
          break;
        case 'text':
          html = renderTextSlideHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'section_divider':
          html = renderSectionDividerHTML(slide, this.colors, this.meta);
          break;
        case 'kpi_dashboard':
          html = renderKPIDashboardHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'sources':
          html = renderSourcesHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'back_cover':
          html = renderBackCoverHTML(slide, this.colors, this.meta);
          break;
        case 'callout':
          html = renderCalloutHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'quote_slide':
          html = renderQuoteSlideHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'news':
          html = renderNewsSlideHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'dual_chart':
          html = renderDualChartHTML(slide, [], this.colors, this.meta, pageNum);
          break;
        case 'image':
          html = renderImageSlideHTML(slide, this.colors, this.meta, pageNum);
          break;
        case 'chart_grid':
          html = renderChartGridHTML(slide, [], this.colors, this.meta, pageNum);
          break;
        default:
          // Fallback: simple centered text
          html = wrapSlide(
            `<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 24px; color: ${this.colors.gray};">Slide type: ${slideType}</div>`,
            this.colors, this.meta, pageNum,
          );
      }

      const htmlPath = path.join(outputDir, `slide_${String(i).padStart(3, '0')}.html`);
      writeFileSync(htmlPath, html);
      htmlPaths.push(htmlPath);
    }

    return htmlPaths;
  }

  /**
   * Screenshot all HTML slides using Playwright.
   * Returns paths to PNG screenshots.
   */
  async screenshotSlides(htmlPaths: string[], outputDir: string): Promise<string[]> {
    // Dynamic import — playwright may not be installed in all envs
    const { chromium } = await import('playwright');

    mkdirSync(outputDir, { recursive: true });
    const pngPaths: string[] = [];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2, // Retina quality
    });

    try {
      const page = await context.newPage();

      for (let i = 0; i < htmlPaths.length; i++) {
        const htmlPath = htmlPaths[i];
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

        // Wait for web fonts to load
        await page.waitForTimeout(500);

        const pngPath = path.join(outputDir, `slide_${String(i).padStart(3, '0')}.png`);
        await page.screenshot({
          path: pngPath,
          fullPage: false,
          type: 'png',
        });
        pngPaths.push(pngPath);
      }
    } finally {
      await browser.close();
    }

    return pngPaths;
  }

  /**
   * Full pipeline: generate HTML → screenshot → return paths.
   */
  async renderAllSlides(outputDir: string): Promise<SlideRenderResult> {
    const start = Date.now();
    const htmlDir = path.join(outputDir, 'html');
    const pngDir = path.join(outputDir, 'screenshots');

    const htmlPaths = this.generateHTML(htmlDir);
    const slidePaths = await this.screenshotSlides(htmlPaths, pngDir);

    return {
      slidePaths,
      htmlPaths,
      duration: Date.now() - start,
    };
  }
}
