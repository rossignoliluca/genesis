/**
 * Genesis v33 - Interactive HTML Companion Report Generator (Item 23)
 *
 * Converts PresentationSpec (same JSON used for PPTX) into a standalone
 * interactive HTML report with:
 * - Responsive layout matching rossignoli_editorial palette
 * - Interactive charts via embedded Chart.js (CDN)
 * - Drill-down sections, hover tooltips, tab switching
 * - Single-file output (all CSS/JS inline)
 * - Print stylesheet for PDF export
 *
 * Integration: Called from weekly-pipeline.ts Step 7b alongside PPTX render.
 */

import type { PresentationSpec } from './types.js';
import { writeFileSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface HTMLReportOptions {
  /** Output file path */
  outputPath: string;
  /** Override palette (default: rossignoli_editorial) */
  darkMode?: boolean;
  /** Include Chart.js CDN (default: true) */
  includeChartJs?: boolean;
  /** Company name override */
  companyName?: string;
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate a standalone interactive HTML report from a PresentationSpec.
 */
export function generateHTMLReport(
  spec: PresentationSpec,
  options: HTMLReportOptions,
): { success: boolean; path: string; sections: number } {
  try {
    const companyName = options.companyName || spec.meta?.company || 'Rossignoli & Partners';
    const title = spec.meta?.title || 'Weekly Market Strategy';
    const date = spec.meta?.date || new Date().toISOString().slice(0, 10);
    const isDark = options.darkMode || false;

    const sections: string[] = [];

    for (const slide of spec.slides || []) {
      const html = convertSlide(slide, isDark);
      if (html) sections.push(html);
    }

    const fullHtml = buildDocument({
      title,
      companyName,
      date,
      sections,
      isDark,
      includeChartJs: options.includeChartJs !== false,
    });

    writeFileSync(options.outputPath, fullHtml, 'utf-8');

    return {
      success: true,
      path: options.outputPath,
      sections: sections.length,
    };
  } catch (error) {
    console.error('[HTMLGenerator] Failed:', error);
    return { success: false, path: options.outputPath, sections: 0 };
  }
}

// ============================================================================
// Document Builder
// ============================================================================

function buildDocument(params: {
  title: string;
  companyName: string;
  date: string;
  sections: string[];
  isDark: boolean;
  includeChartJs: boolean;
}): string {
  const { title, companyName, date, sections, isDark, includeChartJs } = params;

  const bg = isDark ? '#0A1628' : '#FAFAFA';
  const cardBg = isDark ? '#112240' : '#FFFFFF';
  const text = isDark ? '#E0E0E0' : '#1A1A1A';
  const muted = isDark ? '#8899AA' : '#666666';
  const border = isDark ? '#1E3A5F' : '#E0E0E0';
  const accent = '#E86C00';
  const navy = isDark ? '#1A3A6A' : '#0C2340';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
  <title>${escapeHtml(title)} — ${escapeHtml(companyName)}</title>
  ${includeChartJs ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>' : ''}
  <style>
    :root {
      --bg: ${bg};
      --card: ${cardBg};
      --text: ${text};
      --muted: ${muted};
      --border: ${border};
      --accent: ${accent};
      --navy: ${navy};
      --green: #2E865F;
      --red: #CC0000;
      --gold: #B8860B;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.65;
      max-width: 960px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Header */
    .report-header {
      border-top: 3px solid var(--accent);
      padding: 30px 0 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .report-header h1 {
      font-size: 18px;
      font-weight: 400;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--navy);
    }
    .report-header .date {
      font-size: 13px;
      color: var(--muted);
      letter-spacing: 1px;
    }

    /* Navigation */
    .nav-tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid var(--border);
      margin-bottom: 30px;
      overflow-x: auto;
    }
    .nav-tab {
      padding: 10px 18px;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      color: var(--muted);
      white-space: nowrap;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      transition: all 0.2s;
    }
    .nav-tab:hover { color: var(--text); }
    .nav-tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* Sections */
    .report-section {
      display: none;
      animation: fadeIn 0.3s ease;
    }
    .report-section.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    /* Cards */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .card h2 {
      font-size: 16px;
      color: var(--navy);
      margin-bottom: 16px;
      border-left: 3px solid var(--accent);
      padding-left: 12px;
    }
    .card h3 {
      font-size: 14px;
      color: var(--text);
      margin: 16px 0 8px;
    }

    /* Section divider */
    .section-divider {
      background: var(--navy);
      color: white;
      padding: 20px 24px;
      border-radius: 4px;
      margin: 30px 0 20px;
    }
    .section-divider h2 {
      font-size: 20px;
      font-weight: 400;
      letter-spacing: 1px;
      border: none;
      padding: 0;
      color: white;
    }
    .section-badge {
      display: inline-block;
      background: var(--accent);
      color: white;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 2px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 16px 0;
    }
    .kpi-item {
      background: var(--bg);
      padding: 16px;
      border-radius: 4px;
      text-align: center;
    }
    .kpi-item .label {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .kpi-item .value {
      font-size: 24px;
      font-weight: bold;
      margin: 4px 0;
    }
    .kpi-item .change {
      font-size: 13px;
    }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .neutral { color: var(--muted); }

    /* Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .data-table th {
      background: var(--navy);
      color: white;
      padding: 8px 12px;
      text-align: left;
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .data-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .data-table tr:hover { background: rgba(232, 108, 0, 0.05); }

    /* Charts */
    .chart-container {
      position: relative;
      margin: 16px 0;
      padding: 10px;
      background: var(--card);
      border-radius: 4px;
    }
    .chart-container canvas { max-height: 350px; }

    /* Editorial narrative */
    .narrative {
      border-left: 3px solid var(--accent);
      padding: 16px 20px;
      margin: 16px 0;
      background: rgba(232, 108, 0, 0.03);
    }
    .narrative .confidence {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      border-radius: 2px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }

    /* Two-column */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    /* Quote */
    .quote-block {
      border-left: 4px solid var(--gold);
      padding: 20px 24px;
      margin: 20px 0;
      font-style: italic;
      font-size: 18px;
      color: var(--navy);
    }
    .quote-block .attribution {
      font-size: 12px;
      color: var(--muted);
      font-style: normal;
      margin-top: 10px;
    }

    /* Footer */
    .report-footer {
      border-top: 1px solid var(--border);
      padding: 20px 0;
      margin-top: 40px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.5;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }

    /* Positioning badges */
    .badge-long { background: #E8F5E9; color: #2E865F; padding: 2px 8px; border-radius: 2px; font-size: 11px; }
    .badge-short { background: #FFEBEE; color: #CC0000; padding: 2px 8px; border-radius: 2px; font-size: 11px; }
    .badge-neutral { background: #FFF3E0; color: #E65100; padding: 2px 8px; border-radius: 2px; font-size: 11px; }
    .badge-high { font-weight: bold; }

    /* Print */
    @media print {
      .nav-tabs { display: none; }
      .report-section { display: block !important; page-break-inside: avoid; }
      body { max-width: none; }
    }

    /* Responsive */
    @media (max-width: 640px) {
      .two-col { grid-template-columns: 1fr; }
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .report-header { flex-direction: column; gap: 8px; }
    }
  </style>
</head>
<body>
  <header class="report-header">
    <h1>${escapeHtml(companyName)}</h1>
    <span class="date">${escapeHtml(date)}</span>
  </header>

  <nav class="nav-tabs" id="nav">
    <div class="nav-tab active" data-section="all">Overview</div>
  </nav>

  <main id="content">
    <div class="report-section active" data-section="all">
      ${sections.join('\n\n')}
    </div>
  </main>

  <footer class="report-footer">
    This material is for informational purposes only and does not constitute investment advice.
    Past performance is not indicative of future results.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.
  </footer>

  <script>
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.report-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        const section = tab.dataset.section;
        const target = document.querySelector('[data-section="' + section + '"]');
        if (target) target.classList.add('active');
      });
    });

    // Collapsible sections
    document.querySelectorAll('[data-collapsible]').forEach(el => {
      el.addEventListener('click', () => {
        const target = document.getElementById(el.dataset.collapsible);
        if (target) {
          target.style.display = target.style.display === 'none' ? 'block' : 'none';
          el.textContent = target.style.display === 'none' ? '▸ Expand' : '▾ Collapse';
        }
      });
    });
  </script>
</body>
</html>`;
}

// ============================================================================
// Slide Converters
// ============================================================================

function convertSlide(slide: any, isDark: boolean): string {
  if (!slide || !slide.type) return '';

  switch (slide.type) {
    case 'cover':
      return convertCover(slide);
    case 'executive_summary':
      return convertExecutiveSummary(slide);
    case 'section_divider':
      return convertSectionDivider(slide);
    case 'editorial':
      return convertEditorial(slide);
    case 'chart':
      return convertChart(slide);
    case 'dual_chart':
      return convertDualChart(slide);
    case 'text':
      return convertText(slide);
    case 'kpi_dashboard':
      return convertKPI(slide);
    case 'quote_slide':
      return convertQuote(slide);
    case 'news':
      return convertNews(slide);
    case 'callout':
      return convertCallout(slide);
    case 'sources':
      return convertSources(slide);
    case 'back_cover':
      return ''; // Skip in HTML
    default:
      return convertGeneric(slide);
  }
}

function convertCover(slide: any): string {
  const title = slide.title || slide.content?.title || '';
  const subtitle = slide.subtitle || slide.content?.subtitle || '';
  return `
    <div class="card" style="text-align: center; padding: 40px; border-top: 4px solid var(--accent);">
      <h2 style="font-size: 24px; border: none; padding: 0; margin-bottom: 12px;">${escapeHtml(title)}</h2>
      ${subtitle ? `<p style="color: var(--muted); font-size: 14px;">${escapeHtml(subtitle)}</p>` : ''}
    </div>`;
}

function convertExecutiveSummary(slide: any): string {
  const content = slide.content || {};
  const sections = content.sections || content.bullets || [];

  let html = '<div class="card"><h2>Executive Summary</h2>';

  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (typeof section === 'string') {
        html += `<p style="margin-bottom: 12px;">${escapeHtml(section)}</p>`;
      } else if (section.title) {
        html += `<h3>${escapeHtml(section.title)}</h3>`;
        html += `<p style="margin-bottom: 12px;">${escapeHtml(section.body || section.content || '')}</p>`;
      }
    }
  }

  html += '</div>';
  return html;
}

function convertSectionDivider(slide: any): string {
  const title = slide.title || slide.content?.title || '';
  const badge = slide.content?.badge || '';
  return `
    <div class="section-divider">
      ${badge ? `<span class="section-badge">${escapeHtml(badge)}</span>` : ''}
      <h2>${escapeHtml(title)}</h2>
    </div>`;
}

function convertEditorial(slide: any): string {
  const title = slide.title || slide.content?.title || '';
  const commentary = slide.content?.commentary || slide.content?.body || '';
  const chart = slide.chart;

  let html = `<div class="card">`;
  html += `<h2>${escapeHtml(title)}</h2>`;

  if (chart) {
    html += convertChartEmbed(chart);
  }

  if (commentary) {
    html += `<div class="narrative"><p>${escapeHtml(commentary)}</p></div>`;
  }

  html += '</div>';
  return html;
}

function convertChart(slide: any): string {
  const title = slide.title || '';
  const chart = slide.chart;

  let html = `<div class="card">`;
  if (title) html += `<h2>${escapeHtml(title)}</h2>`;
  if (chart) html += convertChartEmbed(chart);
  html += '</div>';
  return html;
}

function convertDualChart(slide: any): string {
  const title = slide.title || '';
  const charts = slide.charts || [slide.chart_left, slide.chart_right].filter(Boolean);

  let html = `<div class="card">`;
  if (title) html += `<h2>${escapeHtml(title)}</h2>`;
  html += '<div class="two-col">';
  for (const chart of charts) {
    html += `<div>${convertChartEmbed(chart)}</div>`;
  }
  html += '</div></div>';
  return html;
}

function convertChartEmbed(chart: any): string {
  if (!chart) return '';

  const chartId = `chart_${Math.random().toString(36).slice(2, 10)}`;
  const chartType = chart.type || 'bar';
  const data = chart.data || {};
  const source = chart.source || '';

  // For table_heatmap, render as HTML table
  if (chartType === 'table_heatmap') {
    return convertHeatmapTable(data, source);
  }

  // Map Genesis chart types to Chart.js types
  const chartJsType = mapChartType(chartType);

  // Build Chart.js dataset
  const datasets = buildChartJsDatasets(chartType, data);
  const labels = data.labels || data.categories || [];

  return `
    <div class="chart-container">
      <canvas id="${chartId}"></canvas>
      ${source ? `<p style="font-size: 10px; color: var(--muted); margin-top: 8px; font-style: italic;">${escapeHtml(source)}</p>` : ''}
    </div>
    <script>
      new Chart(document.getElementById('${chartId}'), {
        type: '${chartJsType}',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: ${JSON.stringify(datasets)}
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: ${datasets.length > 1}, position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: { enabled: true, mode: 'index', intersect: false }
          },
          scales: ${chartJsType === 'doughnut' || chartJsType === 'radar' ? '{}' : `{
            x: { grid: { display: false } },
            y: { beginAtZero: ${chartType !== 'line'} }
          }`}
        }
      });
    </script>`;
}

function convertHeatmapTable(data: any, source: string): string {
  const headers = data.columns || data.headers || [];
  const rows = data.rows || [];

  let html = '<div style="overflow-x: auto;"><table class="data-table"><thead><tr>';
  html += '<th></th>';
  for (const h of headers) {
    html += `<th>${escapeHtml(String(h))}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    html += '<tr>';
    html += `<td style="font-weight: 500;">${escapeHtml(String(row.label || row.name || ''))}</td>`;
    const values = row.values || [];
    for (const val of values) {
      const num = parseFloat(String(val).replace(/[%$,]/g, ''));
      const cls = !isNaN(num) ? (num > 0 ? 'positive' : num < 0 ? 'negative' : 'neutral') : '';
      html += `<td class="${cls}">${escapeHtml(String(val))}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  if (source) html += `<p style="font-size: 10px; color: var(--muted); margin-top: 8px; font-style: italic;">${escapeHtml(source)}</p>`;
  return html;
}

function convertText(slide: any): string {
  const title = slide.title || '';
  const content = slide.content || {};
  const bullets = content.bullets || content.items || [];
  const body = content.body || content.text || '';

  let html = '<div class="card">';
  if (title) html += `<h2>${escapeHtml(title)}</h2>`;
  if (body) html += `<p>${escapeHtml(body)}</p>`;
  if (bullets.length > 0) {
    html += '<ul style="padding-left: 20px; margin-top: 12px;">';
    for (const b of bullets) {
      html += `<li style="margin-bottom: 8px;">${escapeHtml(typeof b === 'string' ? b : b.text || String(b))}</li>`;
    }
    html += '</ul>';
  }
  html += '</div>';
  return html;
}

function convertKPI(slide: any): string {
  const title = slide.title || 'Key Metrics';
  const metrics = slide.content?.metrics || slide.content?.kpis || [];

  let html = `<div class="card"><h2>${escapeHtml(title)}</h2><div class="kpi-grid">`;

  for (const m of metrics) {
    const changeClass = m.change?.startsWith('+') ? 'positive'
      : m.change?.startsWith('-') ? 'negative' : 'neutral';
    html += `
      <div class="kpi-item">
        <div class="label">${escapeHtml(m.label || m.name || '')}</div>
        <div class="value">${escapeHtml(String(m.value || ''))}</div>
        ${m.change ? `<div class="change ${changeClass}">${escapeHtml(m.change)}</div>` : ''}
      </div>`;
  }

  html += '</div></div>';
  return html;
}

function convertQuote(slide: any): string {
  const quote = slide.content?.quote || slide.content?.text || '';
  const attribution = slide.content?.attribution || slide.content?.author || '';
  return `
    <div class="quote-block">
      "${escapeHtml(quote)}"
      ${attribution ? `<div class="attribution">— ${escapeHtml(attribution)}</div>` : ''}
    </div>`;
}

function convertNews(slide: any): string {
  const title = slide.title || 'Headlines';
  const items = slide.content?.items || slide.content?.headlines || [];

  let html = `<div class="card"><h2>${escapeHtml(title)}</h2>`;
  for (const item of items) {
    html += `<p style="margin-bottom: 8px; padding-left: 12px; border-left: 2px solid var(--border);">`;
    html += escapeHtml(typeof item === 'string' ? item : item.headline || item.text || String(item));
    html += '</p>';
  }
  html += '</div>';
  return html;
}

function convertCallout(slide: any): string {
  const title = slide.title || '';
  const body = slide.content?.body || slide.content?.text || '';
  return `
    <div class="card" style="border-left: 4px solid var(--accent); background: rgba(232, 108, 0, 0.03);">
      ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
      <p>${escapeHtml(body)}</p>
    </div>`;
}

function convertSources(slide: any): string {
  const sources = slide.content?.sources || slide.content?.items || [];
  let html = '<div class="card"><h2>Sources & Disclosures</h2>';
  html += '<p style="font-size: 12px; color: var(--muted);">';
  if (Array.isArray(sources)) {
    html += sources.map(s => escapeHtml(typeof s === 'string' ? s : s.name || String(s))).join(' | ');
  }
  html += '</p></div>';
  return html;
}

function convertGeneric(slide: any): string {
  const title = slide.title || slide.type || '';
  const content = JSON.stringify(slide.content || {}, null, 2);
  return `
    <div class="card">
      <h2>${escapeHtml(title)}</h2>
      <pre style="font-size: 12px; overflow-x: auto; color: var(--muted);">${escapeHtml(content)}</pre>
    </div>`;
}

// ============================================================================
// Chart.js Helpers
// ============================================================================

function mapChartType(genesisType: string): string {
  const map: Record<string, string> = {
    line: 'line',
    bar: 'bar',
    hbar: 'bar',
    stacked_bar: 'bar',
    area: 'line',
    scatter: 'scatter',
    donut_matrix: 'doughnut',
    gauge: 'doughnut',
    lollipop: 'bar',
    dumbbell: 'bar',
    bump: 'line',
    sparkline_table: 'line',
    small_multiples: 'line',
    waterfall: 'bar',
    return_quilt: 'bar',
  };
  return map[genesisType] || 'bar';
}

function buildChartJsDatasets(type: string, data: any): any[] {
  const palette = ['#003366', '#117ACA', '#E86C00', '#2E865F', '#CC0000', '#B8860B', '#6C3483', '#2C3E50'];

  // Series-based (line, area, bump)
  if (data.series && Array.isArray(data.series)) {
    return data.series.map((s: any, i: number) => ({
      label: s.name || s.label || `Series ${i + 1}`,
      data: s.values || s.data || [],
      borderColor: palette[i % palette.length],
      backgroundColor: type === 'area'
        ? `${palette[i % palette.length]}33`
        : palette[i % palette.length],
      fill: type === 'area',
      tension: 0.3,
    }));
  }

  // Values-based (bar, hbar, lollipop)
  if (data.values && Array.isArray(data.values)) {
    return [{
      label: data.title || '',
      data: data.values,
      backgroundColor: data.values.map((v: number) =>
        v >= 0 ? '#2E865F' : '#CC0000'
      ),
    }];
  }

  // Groups-based (stacked_bar)
  if (data.groups && Array.isArray(data.groups)) {
    return data.groups.map((g: any, i: number) => ({
      label: g.name || g.label || `Group ${i + 1}`,
      data: g.values || [],
      backgroundColor: palette[i % palette.length],
    }));
  }

  return [{ label: 'Data', data: [], backgroundColor: palette[0] }];
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
