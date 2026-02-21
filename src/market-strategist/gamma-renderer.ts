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

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Gamma API Client
// ============================================================================

const GAMMA_API_BASE = 'https://public-api.gamma.app/v1.0';

/**
 * Render a PresentationSpec via the Gamma.app API.
 *
 * 1. Convert spec → Gamma markdown input
 * 2. POST to /generations
 * 3. Poll until completed
 * 4. Return URLs (Gamma viewer, PPTX export, PDF export)
 */
export async function renderViaGamma(spec: PresentationSpec): Promise<GammaRenderResult> {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'GAMMA_API_KEY not set' };
  }

  try {
    // 1. Convert to Gamma input
    const inputText = specToGammaMarkdown(spec);

    // 2. Create generation
    const response = await fetch(`${GAMMA_API_BASE}/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        inputText,
        textMode: 'preserve',
        format: 'presentation',
        ...(process.env.GAMMA_THEME_ID ? { themeId: process.env.GAMMA_THEME_ID } : {}),
        numCards: Math.min(spec.slides.length, 60),
        cardSplit: 'inputTextBreaks',
        additionalInstructions: 'Institutional financial report style. Professional, minimal, data-driven. Executive summary first, then asset class sections with charts and commentary.',
        textOptions: {
          amount: 'detailed',
          tone: 'professional',
          audience: 'institutional investors',
        },
        imageOptions: {
          source: 'aiGenerated',
          model: 'flux-1-pro',
          style: 'professional',
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Gamma API HTTP ${response.status}: ${errText}` };
    }

    const generation: GammaGenerationResponse = await response.json();
    console.log(`  [gamma] Generation created: ${generation.id}`);

    // 3. Poll for completion (max 120s)
    const result = await pollGeneration(apiKey, generation.id, 120000);
    if (!result.success) return result;

    return result;
  } catch (e) {
    return { success: false, error: `Gamma render failed: ${(e as Error).message}` };
  }
}

/**
 * Poll a Gamma generation until completion or timeout.
 */
async function pollGeneration(apiKey: string, generationId: string, timeoutMs: number): Promise<GammaRenderResult> {
  const start = Date.now();
  const pollInterval = 3000; // 3s between checks

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const response = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
        headers: { 'X-API-KEY': apiKey },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`  [gamma] Poll HTTP ${response.status}`);
        continue;
      }

      const gen: GammaGenerationResponse = await response.json();

      if (gen.status === 'completed') {
        console.log(`  [gamma] Generation completed: ${gen.url}`);
        return {
          success: true,
          generationId,
          gammaUrl: gen.url,
          // Gamma provides export URLs via the generation response or a separate endpoint
          pptxUrl: gen.url ? `${gen.url}/export/pptx` : undefined,
          pdfUrl: gen.url ? `${gen.url}/export/pdf` : undefined,
        };
      }

      if (gen.status === 'failed') {
        return { success: false, generationId, error: gen.error || 'Generation failed' };
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`  [gamma] Status: ${gen.status} (${elapsed}s elapsed)`);
    } catch (e) {
      console.warn(`  [gamma] Poll error: ${(e as Error).message}`);
    }
  }

  return { success: false, generationId, error: `Gamma generation timed out after ${timeoutMs / 1000}s` };
}

// ============================================================================
// Spec → Gamma Markdown Converter
// ============================================================================

/**
 * Convert a PresentationSpec to Gamma-compatible markdown input.
 * Uses \n---\n as card/slide breaks (Gamma's cardSplit: 'inputTextBreaks').
 */
export function specToGammaMarkdown(spec: PresentationSpec): string {
  const parts: string[] = [];

  for (const slide of spec.slides) {
    parts.push(slideToMarkdown(slide));
  }

  return parts.join('\n---\n');
}

function slideToMarkdown(slide: SlideSpec): string {
  const content = slide.content as any;

  switch (slide.type) {
    case 'cover':
      return [
        `# ${content.headline || content.title || ''}`,
        content.subheadline ? `## ${content.subheadline}` : '',
        content.date_range ? `*${content.date_range}*` : '',
        content.company ? `**${content.company}**` : '',
      ].filter(Boolean).join('\n\n');

    case 'executive_summary': {
      const lines = [`## ${content.title || 'Executive Summary'}`];
      if (content.sections) {
        for (const section of content.sections) {
          lines.push(`### ${section.label || ''}`);
          lines.push(section.text || '');
        }
      }
      if (content.bullets) {
        for (const b of content.bullets) lines.push(`- ${b}`);
      }
      return lines.join('\n\n');
    }

    case 'section_divider':
      return `# ${content.title || ''}${content.subtitle ? `\n\n*${content.subtitle}*` : ''}`;

    case 'editorial':
      return [
        `## ${content.title || ''}`,
        content.commentary || '',
        content.image_path ? `![Chart](file://${content.image_path})` : '',
        content.source ? `*${content.source}*` : '',
      ].filter(Boolean).join('\n\n');

    case 'chart':
      return [
        `## ${content.title || 'Chart'}`,
        content.commentary || content.narrative || '',
        content.source ? `*${content.source}*` : '',
      ].filter(Boolean).join('\n\n');

    case 'kpi_dashboard': {
      const kpis = content.kpis || [];
      if (kpis.length === 0) return `## ${content.title || 'KPIs'}`;
      const header = '| Metric | Value | Change |';
      const sep = '|--------|-------|--------|';
      const rows = kpis.map((k: any) => `| ${k.label || ''} | ${k.value || ''} | ${k.delta || ''} |`);
      return [`## ${content.title || 'Key Metrics'}`, header, sep, ...rows].join('\n');
    }

    case 'text':
      return [
        content.title ? `## ${content.title}` : '',
        content.body || content.text || '',
      ].filter(Boolean).join('\n\n');

    case 'callout':
      return [
        content.title ? `## ${content.title}` : '',
        content.text ? `> ${content.text}` : '',
      ].filter(Boolean).join('\n\n');

    case 'quote_slide':
      return [
        content.quote ? `> "${content.quote}"` : '',
        content.attribution ? `— *${content.attribution}*` : '',
      ].filter(Boolean).join('\n\n');

    case 'chart_grid': {
      const lines = [`## ${content.title || 'Charts'}`];
      if (content.grid) {
        for (const g of content.grid) {
          lines.push(`- **${g.label || ''}**${g.image_path ? ` ![](file://${g.image_path})` : ''}`);
        }
      }
      return lines.join('\n');
    }

    case 'sources': {
      const lines = [`## Sources & Methodology`];
      if (content.sources) {
        for (const s of content.sources) lines.push(`- ${s}`);
      }
      return lines.join('\n');
    }

    case 'back_cover':
      return [
        `# ${content.company || 'Thank You'}`,
        content.tagline || '',
        content.contact ? (Array.isArray(content.contact) ? content.contact.join(' | ') : content.contact) : '',
        content.website || '',
      ].filter(Boolean).join('\n\n');

    default:
      return content.title ? `## ${content.title}` : `## ${slide.type}`;
  }
}
