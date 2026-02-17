/**
 * Genesis Audio Podcast Generator — NotebookLM-style Conversational Report
 *
 * Converts a weekly market report into a two-host conversational podcast.
 * Uses LLM to generate the dialogue script, then TTS to synthesize audio.
 *
 * Architecture:
 * 1. Extract key content from PresentationSpec + MarketBrief
 * 2. Generate conversational script via LLM (two personas: Host + Analyst)
 * 3. Synthesize speech segments via TTS (OpenAI TTS or FAL AI)
 * 4. Concatenate audio segments with transitions via ffmpeg
 * 5. Output final MP3/WAV
 *
 * Usage:
 *   const podcast = new PodcastGenerator();
 *   const result = await podcast.generate(spec, brief, '/tmp/weekly.mp3');
 */

import type { PresentationSpec } from '../types.js';
import type { MarketBrief } from '../../market-strategist/types.js';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PodcastResult {
  success: boolean;
  path?: string;
  durationSeconds: number;
  segments: number;
  error?: string;
}

export interface PodcastOptions {
  /** Host voice (OpenAI TTS voice name) */
  hostVoice?: string;
  /** Analyst voice */
  analystVoice?: string;
  /** Target duration in minutes (default: 5) */
  targetMinutes?: number;
  /** Include intro jingle (default: true) */
  includeIntro?: boolean;
  /** Language (default: 'en') */
  language?: string;
  /** TTS provider */
  ttsProvider?: 'openai' | 'mcp-openai';
}

interface DialogueSegment {
  speaker: 'host' | 'analyst';
  text: string;
}

interface DialogueScript {
  title: string;
  segments: DialogueSegment[];
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractContentForPodcast(spec: PresentationSpec, brief?: MarketBrief): string {
  const lines: string[] = [];

  // Report metadata
  lines.push(`Report: ${spec.meta.title || 'Weekly Market Strategy'}`);
  lines.push(`Date: ${spec.meta.date || 'This week'}`);
  lines.push('');

  // Extract from brief if available
  if (brief) {
    lines.push('## Market Sentiment');
    lines.push(`Overall: ${brief.snapshot?.sentiment?.overall || 'N/A'} (Score: ${brief.snapshot?.sentiment?.score || 'N/A'})`);
    lines.push('');

    if (brief.snapshot?.themes?.length) {
      lines.push('## Key Themes');
      brief.snapshot.themes.forEach(t => lines.push(`- ${t}`));
      lines.push('');
    }

    if (brief.narratives?.length) {
      lines.push('## Narratives');
      brief.narratives.forEach(n => {
        lines.push(`### ${n.title}`);
        lines.push(n.thesis);
        lines.push('');
      });
    }

    if (brief.positioning?.length) {
      lines.push('## Positioning');
      brief.positioning.forEach(p => {
        lines.push(`- ${p.assetClass}: ${p.position} — ${p.rationale}`);
      });
      lines.push('');
    }

    if (brief.risks?.length) {
      lines.push('## Key Risks');
      brief.risks.forEach(r => lines.push(`- ${r}`));
      lines.push('');
    }

    if (brief.opportunities?.length) {
      lines.push('## Opportunities');
      brief.opportunities.forEach(o => lines.push(`- ${o}`));
    }
  }

  // Extract from slides
  for (const slide of spec.slides) {
    const content = slide.content as any;
    if (slide.type === 'executive_summary' && content.sections) {
      lines.push('\n## Executive Summary');
      content.sections.forEach((s: any) => {
        lines.push(`**${s.label}**: ${s.text}`);
      });
    }
    if (slide.type === 'editorial' && content.commentary) {
      lines.push(`\n## ${content.title || 'Analysis'}`);
      lines.push(content.commentary);
    }
    if (slide.type === 'callout' && (content.text || content.body)) {
      lines.push(`\n## ${content.title || 'Key Point'}`);
      lines.push(content.text || content.body);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Script Generation
// ============================================================================

async function generateScript(
  content: string,
  opts: PodcastOptions,
): Promise<DialogueScript> {
  const targetMin = opts.targetMinutes || 5;
  const language = opts.language || 'en';

  const systemPrompt = `You are a podcast script writer for a financial market report podcast called "Market Pulse Weekly" by Rossignoli & Partners.

Write a conversational dialogue between two people:
- HOST (Marco): Warm, engaging, asks smart questions, introduces topics. Speaks ${language === 'it' ? 'Italian' : 'English'}.
- ANALYST (Sofia): Sharp, data-driven, gives institutional-quality insights. Uses specific numbers. Speaks ${language === 'it' ? 'Italian' : 'English'}.

Guidelines:
- Target ~${targetMin} minutes of audio (~${targetMin * 150} words)
- Open with a brief intro/greeting
- Cover 3-4 main topics from the report
- Include specific data points and numbers
- End with a key takeaway / positioning summary
- Tone: Professional but conversational, like Bloomberg TV meets a smart podcast
- NO filler words, NO "um", NO "uh"
- Each segment should be 2-4 sentences

Output format: JSON array of objects with "speaker" ("host" or "analyst") and "text" fields.
Example: [{"speaker": "host", "text": "Welcome to Market Pulse Weekly..."}, {"speaker": "analyst", "text": "Thanks Marco, big week..."}]`;

  const userPrompt = `Generate a podcast dialogue script from this weekly market report content:\n\n${content}`;

  // Try to use MCP OpenAI for generation
  try {
    const { getMCPClient } = await import('../../mcp/index.js');
    const mcp = getMCPClient();
    const result = await mcp.call('openai' as any, 'openai_chat', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const raw = result.data;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) :
      (typeof raw === 'object' ? raw : JSON.parse(JSON.stringify(raw)));
    const segments: DialogueSegment[] = Array.isArray(parsed) ? parsed :
      (parsed.segments || parsed.dialogue || []);

    return {
      title: 'Market Pulse Weekly',
      segments,
    };
  } catch (err) {
    console.error('[PodcastGenerator] Script generation via MCP failed, using fallback:', err);
    // Fallback: generate a basic script from content
    return generateFallbackScript(content, targetMin);
  }
}

function generateFallbackScript(content: string, targetMin: number): DialogueScript {
  const lines = content.split('\n').filter(l => l.trim().length > 10);
  const segments: DialogueSegment[] = [];

  segments.push({
    speaker: 'host',
    text: 'Welcome to Market Pulse Weekly by Rossignoli & Partners. I\'m Marco, and with me as always is our chief strategist Sofia. Sofia, what a week it\'s been in the markets.',
  });

  segments.push({
    speaker: 'analyst',
    text: 'Thanks Marco. Indeed, there\'s a lot to unpack this week. Let me walk through the key developments.',
  });

  // Extract notable lines from content
  const notable = lines.filter(l =>
    l.includes('%') || l.includes('billion') || l.includes('risk') ||
    l.includes('opportunity') || l.startsWith('**') || l.startsWith('-')
  ).slice(0, 8);

  for (let i = 0; i < notable.length; i++) {
    const clean = notable[i].replace(/^[-*#]+\s*/, '').replace(/\*\*/g, '');
    if (i % 2 === 0) {
      segments.push({
        speaker: 'host',
        text: `Let\'s talk about: ${clean}. What\'s your read on this?`,
      });
    } else {
      segments.push({
        speaker: 'analyst',
        text: `${clean}. This is significant because it reflects the broader market dynamics we\'ve been tracking.`,
      });
    }
  }

  segments.push({
    speaker: 'host',
    text: 'So for investors watching this week, what\'s the key takeaway?',
  });

  segments.push({
    speaker: 'analyst',
    text: 'Stay disciplined, focus on quality, and keep an eye on the data. The market is giving us mixed signals, and that means selectivity matters more than ever.',
  });

  segments.push({
    speaker: 'host',
    text: 'Great insights as always, Sofia. That\'s it for this week\'s Market Pulse. Until next time, stay informed and stay invested.',
  });

  return { title: 'Market Pulse Weekly', segments };
}

// ============================================================================
// TTS Synthesis
// ============================================================================

async function synthesizeSegment(
  text: string,
  voice: string,
  outputPath: string,
): Promise<boolean> {
  try {
    const { getMCPClient } = await import('../../mcp/index.js');
    const mcp = getMCPClient();

    // Use OpenAI TTS via MCP
    const result = await mcp.call('openai' as any, 'openai_chat', {
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    });

    // If MCP returns audio data, write it
    const data = result.data as any;
    if (data && typeof data === 'object' && 'audio' in data) {
      const audioData = Buffer.from(data.audio, 'base64');
      fs.writeFileSync(outputPath, audioData);
      return true;
    }

    return false;
  } catch (err) {
    console.error('[PodcastGenerator] TTS synthesis via MCP failed, falling back to system say:', err);
    // Fallback: use system `say` command on macOS
    return new Promise((resolve) => {
      const child = spawn('say', [
        '-v', voice === 'alloy' ? 'Samantha' : 'Daniel',
        '-o', outputPath,
        '--data-format=LEF32@22050',
        text,
      ]);
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }
}

// ============================================================================
// Audio Concatenation via ffmpeg
// ============================================================================

async function concatenateAudio(
  segmentPaths: string[],
  outputPath: string,
  includeIntro: boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    // Create ffmpeg concat file
    const concatDir = path.dirname(outputPath);
    const concatFile = path.join(concatDir, 'concat.txt');

    const entries = segmentPaths
      .filter(p => fs.existsSync(p))
      .map(p => `file '${p}'`)
      .join('\n');

    fs.writeFileSync(concatFile, entries);

    const child = spawn('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-acodec', 'libmp3lame',
      '-ab', '192k',
      '-ar', '44100',
      outputPath,
    ]);

    child.on('close', (code) => {
      // Cleanup
      try { fs.unlinkSync(concatFile); } catch (err) {
        console.error('[PodcastGenerator] Failed to remove concat file:', err);
      }
      resolve(code === 0);
    });
    child.on('error', () => resolve(false));
  });
}

// ============================================================================
// Main Generator
// ============================================================================

export class PodcastGenerator {
  private options: PodcastOptions;

  constructor(options: PodcastOptions = {}) {
    this.options = {
      hostVoice: options.hostVoice || 'onyx',      // Deep, warm male
      analystVoice: options.analystVoice || 'nova', // Clear, professional female
      targetMinutes: options.targetMinutes || 5,
      includeIntro: options.includeIntro ?? true,
      language: options.language || 'en',
      ttsProvider: options.ttsProvider || 'mcp-openai',
      ...options,
    };
  }

  /**
   * Generate a podcast from a presentation spec and optional brief.
   */
  async generate(
    spec: PresentationSpec,
    brief: MarketBrief | undefined,
    outputPath: string,
  ): Promise<PodcastResult> {
    const startTime = Date.now();
    const segDir = path.join(path.dirname(outputPath), 'podcast_segments');
    fs.mkdirSync(segDir, { recursive: true });

    try {
      // Step 1: Extract content
      const content = extractContentForPodcast(spec, brief);

      // Step 2: Generate dialogue script
      console.log('  [podcast] Generating dialogue script...');
      const script = await generateScript(content, this.options);

      if (!script.segments.length) {
        return {
          success: false,
          durationSeconds: 0,
          segments: 0,
          error: 'Empty script generated',
        };
      }

      // Step 3: Synthesize each segment
      console.log(`  [podcast] Synthesizing ${script.segments.length} segments...`);
      const segmentPaths: string[] = [];

      for (let i = 0; i < script.segments.length; i++) {
        const seg = script.segments[i];
        const voice = seg.speaker === 'host'
          ? this.options.hostVoice!
          : this.options.analystVoice!;

        const segPath = path.join(segDir, `seg_${String(i).padStart(3, '0')}.mp3`);
        const ok = await synthesizeSegment(seg.text, voice, segPath);

        if (ok && fs.existsSync(segPath)) {
          segmentPaths.push(segPath);
        } else {
          console.warn(`  [podcast] Segment ${i} synthesis failed, skipping`);
        }
      }

      if (segmentPaths.length === 0) {
        // Fallback: write the script as a text file
        const scriptPath = outputPath.replace(/\.(mp3|wav)$/, '_script.json');
        fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
        return {
          success: false,
          durationSeconds: 0,
          segments: script.segments.length,
          error: `TTS synthesis failed. Script saved to ${scriptPath}`,
        };
      }

      // Step 4: Concatenate segments
      console.log('  [podcast] Concatenating audio...');
      const ok = await concatenateAudio(segmentPaths, outputPath, this.options.includeIntro!);

      if (!ok) {
        return {
          success: false,
          durationSeconds: 0,
          segments: segmentPaths.length,
          error: 'ffmpeg concatenation failed',
        };
      }

      // Estimate duration (~150 words/minute for speech)
      const totalWords = script.segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
      const estDuration = Math.round((totalWords / 150) * 60);

      // Cleanup segment files
      for (const sp of segmentPaths) {
        try { fs.unlinkSync(sp); } catch (err) {
          console.error('[PodcastGenerator] Failed to remove segment file:', err);
        }
      }
      try { fs.rmdirSync(segDir); } catch (err) {
        console.error('[PodcastGenerator] Failed to remove segment directory:', err);
      }

      return {
        success: true,
        path: outputPath,
        durationSeconds: estDuration,
        segments: script.segments.length,
      };
    } catch (err: any) {
      return {
        success: false,
        durationSeconds: 0,
        segments: 0,
        error: err.message || String(err),
      };
    }
  }
}
