/**
 * Genesis — Gamma.app API Renderer
 *
 * Converts a PresentationSpec into Gamma.app input, generates a
 * professional presentation via the Gamma API, and exports PPTX + PDF.
 *
 * Requires:
 *   GAMMA_API_KEY  — Gamma API key
 *   GAMMA_THEME_ID — Pre-created Rossignoli & Partners theme ID (optional)
 */

import type { PresentationSpec, SlideSpec } from '../presentation/types.js';

export interface GammaRenderResult {
  success: boolean;
  generationId?: string;
  gammaUrl?: string;
  pptxUrl?: string;
  pdfUrl?: string;
  error?: string;
}

interface GammaGenerationResponse {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  url?: string;
  error?: string;
}

const GAMMA_API_BASE = 'https://public-api.gamma.app/v1.0';

export async function renderViaGamma(spec: PresentationSpec): Promise<GammaRenderResult> {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) return { success: false, error: 'GAMMA_API_KEY not set' };

  try {
    const inputText = specToGammaMarkdown(spec);
    const response = await fetch(`${GAMMA_API_BASE}/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({
        inputText, textMode: 'preserve', format: 'presentation',
        ...(process.env.GAMMA_THEME_ID ? { themeId: process.env.GAMMA_THEME_ID } : {}),
        numCards: Math.min(spec.slides.length, 60), cardSplit: 'inputTextBreaks',
        additionalInstructions: 'Institutional financial report style. Professional, minimal, data-driven.',
        textOptions: { amount: 'detailed', tone: 'professional', audience: 'institutional investors' },
        imageOptions: { source: 'aiGenerated', model: 'flux-1-pro', style: 'professional' },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Gamma API HTTP ${response.status}: ${errText}` };
    }

    const generation: GammaGenerationResponse = await response.json();
    console.log(`  [gamma] Generation created: ${generation.id}`);
    return await pollGeneration(apiKey, generation.id, 120000);
  } catch (e) {
    return { success: false, error: `Gamma render failed: ${(e as Error).message}` };
  }
}

async function pollGeneration(apiKey: string, generationId: string, timeoutMs: number): Promise<GammaRenderResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const response = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
        headers: { 'X-API-KEY': apiKey }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { console.warn(`  [gamma] Poll HTTP ${response.status}`); continue; }
      const gen: GammaGenerationResponse = await response.json();
      if (gen.status === 'completed') {
        console.log(`  [gamma] Generation completed: ${gen.url}`);
        return { success: true, generationId, gammaUrl: gen.url,
          pptxUrl: gen.url ? `${gen.url}/export/pptx` : undefined,
          pdfUrl: gen.url ? `${gen.url}/export/pdf` : undefined };
      }
      if (gen.status === 'failed') return { success: false, generationId, error: gen.error || 'Generation failed' };
      console.log(`  [gamma] Status: ${gen.status} (${((Date.now() - start) / 1000).toFixed(0)}s elapsed)`);
    } catch (e) { console.warn(`  [gamma] Poll error: ${(e as Error).message}`); }
  }
  return { success: false, generationId, error: `Gamma generation timed out after ${timeoutMs / 1000}s` };
}

export function specToGammaMarkdown(spec: PresentationSpec): string {
  return spec.slides.map(slideToMarkdown).join('\n---\n');
}

function slideToMarkdown(slide: SlideSpec): string {
  const c = slide.content as any;
  switch (slide.type) {
    case 'cover': return [
      `# ${c.headline || c.title || ''}`, c.subheadline ? `## ${c.subheadline}` : '',
      c.date_range ? `*${c.date_range}*` : '', c.company ? `**${c.company}**` : '',
    ].filter(Boolean).join('\n\n');
    case 'executive_summary': {
      const lines = [`## ${c.title || 'Executive Summary'}`];
      if (c.sections) for (const s of c.sections) { lines.push(`### ${s.label || ''}`); lines.push(s.text || ''); }
      if (c.bullets) for (const b of c.bullets) lines.push(`- ${b}`);
      return lines.join('\n\n');
    }
    case 'section_divider': return `# ${c.title || ''}${c.subtitle ? `\n\n*${c.subtitle}*` : ''}`;
    case 'editorial': return [
      `## ${c.title || ''}`, c.commentary || '',
      c.image_path ? `![Chart](file://${c.image_path})` : '', c.source ? `*${c.source}*` : '',
    ].filter(Boolean).join('\n\n');
    case 'chart': return [`## ${c.title || 'Chart'}`, c.commentary || c.narrative || '', c.source ? `*${c.source}*` : ''].filter(Boolean).join('\n\n');
    case 'kpi_dashboard': {
      const kpis = c.kpis || [];
      if (!kpis.length) return `## ${c.title || 'KPIs'}`;
      return [`## ${c.title || 'Key Metrics'}`, '| Metric | Value | Change |', '|--------|-------|--------|',
        ...kpis.map((k: any) => `| ${k.label || ''} | ${k.value || ''} | ${k.delta || ''} |`)].join('\n');
    }
    case 'text': return [c.title ? `## ${c.title}` : '', c.body || c.text || ''].filter(Boolean).join('\n\n');
    case 'callout': return [c.title ? `## ${c.title}` : '', c.text ? `> ${c.text}` : ''].filter(Boolean).join('\n\n');
    case 'quote_slide': return [c.quote ? `> "${c.quote}"` : '', c.attribution ? `— *${c.attribution}*` : ''].filter(Boolean).join('\n\n');
    case 'chart_grid': {
      const lines = [`## ${c.title || 'Charts'}`];
      if (c.grid) for (const g of c.grid) lines.push(`- **${g.label || ''}**${g.image_path ? ` ![](file://${g.image_path})` : ''}`);
      return lines.join('\n');
    }
    case 'sources': { const lines = [`## Sources & Methodology`]; if (c.sources) for (const s of c.sources) lines.push(`- ${s}`); return lines.join('\n'); }
    case 'back_cover': return [
      `# ${c.company || 'Thank You'}`, c.tagline || '',
      c.contact ? (Array.isArray(c.contact) ? c.contact.join(' | ') : c.contact) : '', c.website || '',
    ].filter(Boolean).join('\n\n');
    default: return c.title ? `## ${c.title}` : `## ${slide.type}`;
  }
}
