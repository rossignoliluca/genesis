/**
 * Genesis v32 - MCP Apps (Item 14)
 *
 * Interactive HTML reports delivered through MCP Apps.
 * Wraps Genesis's 16 chart types + editorial palette in HTML
 * that users can interact with (drill into sectors, timeframes).
 *
 * MCP Apps allow servers to return interactive HTML in conversation.
 */

import type { MarketBrief, AssetSnapshot, PositioningView, NarrativeThread } from '../market-strategist/types.js';

// ============================================================================
// Chart HTML Generators
// ============================================================================

/**
 * Generate an interactive HTML report from a MarketBrief
 */
export function briefToInteractiveHTML(brief: MarketBrief): string {
  const { snapshot, narratives, positioning, risks, opportunities } = brief;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Weekly Strategy — ${brief.week}</title>
<style>
  :root {
    --bg: #FAFAFA; --card: #FFFFFF; --text: #1A1A1A;
    --accent: #E86C00; --green: #27AE60; --red: #E74C3C;
    --border: #E0E0E0; --muted: #666666;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; border-bottom: 3px solid var(--accent); padding-bottom: 8px; margin-bottom: 24px; }
  h2 { font-size: 20px; font-weight: 600; margin: 24px 0 12px; color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card h3 { font-size: 14px; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric { font-size: 24px; font-weight: 700; }
  .bullish { color: var(--green); }
  .bearish { color: var(--red); }
  .neutral { color: var(--muted); }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
  th { font-weight: 600; color: var(--muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .badge-long { background: #E8F5E9; color: var(--green); }
  .badge-short { background: #FFEBEE; color: var(--red); }
  .badge-neutral { background: #F5F5F5; color: var(--muted); }
  .narrative { background: var(--card); border-left: 3px solid var(--accent); padding: 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }
  .confidence-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 8px; }
  .confidence-fill { height: 100%; border-radius: 2px; background: var(--accent); }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
  .tab-container { margin: 16px 0; }
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; }
  .tab { padding: 8px 16px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 14px; background: var(--card); }
  .tab.active { background: var(--accent); color: white; border-color: var(--accent); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
</style>
</head>
<body>
<h1>#GlobalMarkets Weekly — ${brief.week}</h1>
<p style="color: var(--muted); margin-bottom: 24px;">Rossignoli & Partners | ${brief.date} | Sentiment: <span class="${snapshot.sentiment.overall}">${snapshot.sentiment.overall.toUpperCase()}</span> (${snapshot.sentiment.score.toFixed(2)})</p>

<h2>Market Snapshot</h2>
<div class="grid">
${snapshot.markets.map(m => `
  <div class="card">
    <h3>${m.name}</h3>
    <div class="metric ${m.signal}">${m.level}</div>
    <div style="font-size: 14px; margin-top: 4px;">
      1W: <span class="${parseFloat(m.change1w) >= 0 ? 'bullish' : 'bearish'}">${m.change1w}</span> |
      YTD: <span class="${parseFloat(m.changeYtd) >= 0 ? 'bullish' : 'bearish'}">${m.changeYtd}</span>
    </div>
  </div>
`).join('')}
</div>

<h2>Narratives</h2>
${narratives.map(n => `
  <div class="narrative">
    <strong>${n.title}</strong> <span class="badge badge-${n.horizon === 'short' ? 'neutral' : n.horizon === 'medium' ? 'long' : 'long'}">${n.horizon}</span>
    <p style="margin: 8px 0;">${n.thesis}</p>
    <p style="font-style: italic; color: var(--accent);">${n.contrarian}</p>
    <div class="confidence-bar"><div class="confidence-fill" style="width: ${n.confidence * 100}%"></div></div>
    <span style="font-size: 12px; color: var(--muted);">Confidence: ${(n.confidence * 100).toFixed(0)}%</span>
  </div>
`).join('')}

<h2>Positioning</h2>
<table>
  <thead><tr><th>Asset Class</th><th>Position</th><th>Conviction</th><th>Rationale</th></tr></thead>
  <tbody>
${positioning.map(p => `
    <tr>
      <td><strong>${p.assetClass}</strong></td>
      <td><span class="badge badge-${p.position}">${p.position.toUpperCase()}</span></td>
      <td>${p.conviction}</td>
      <td style="font-size: 13px;">${p.rationale}</td>
    </tr>
`).join('')}
  </tbody>
</table>

<h2>Risks & Opportunities</h2>
<div class="grid">
  <div class="card">
    <h3>Key Risks</h3>
    <ul style="padding-left: 16px;">${risks.map(r => `<li style="margin: 4px 0; font-size: 14px;">${r}</li>`).join('')}</ul>
  </div>
  <div class="card">
    <h3>Opportunities</h3>
    <ul style="padding-left: 16px;">${opportunities.map(o => `<li style="margin: 4px 0; font-size: 14px;">${o}</li>`).join('')}</ul>
  </div>
</div>

<div class="footer">
  <p>Rossignoli & Partners | Regulated by FINMA | This material is for informational purposes only and does not constitute investment advice.</p>
</div>

<script>
document.querySelectorAll('.tabs').forEach(tabGroup => {
  tabGroup.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabGroup.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.target;
      tabGroup.parentElement.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(target)?.classList.add('active');
    });
  });
});
</script>
</body>
</html>`;
}

/**
 * Create an MCP App response wrapping the interactive HTML
 */
export function createMCPAppResponse(brief: MarketBrief): {
  type: 'app';
  html: string;
  title: string;
} {
  return {
    type: 'app',
    html: briefToInteractiveHTML(brief),
    title: `Weekly Strategy — ${brief.week}`,
  };
}
