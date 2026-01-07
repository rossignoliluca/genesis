/**
 * Genesis 4.0 - Narrator Agent
 *
 * Creates coherent narratives from events and experiences.
 * The storyteller: "Here's what happened..."
 *
 * Features:
 * - Event to narrative transformation
 * - Temporal coherence
 * - Causal reasoning
 * - Multi-perspective storytelling
 * - Summary generation
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
} from './types.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface Event {
  id: string;
  type: string;
  timestamp: Date;
  actors: string[];
  action: string;
  outcome?: string;
  context?: string;
  importance?: number;
}

interface Narrative {
  id: string;
  title: string;
  summary: string;
  chapters: Chapter[];
  themes: string[];
  timeline: {
    start: Date;
    end: Date;
    duration: number; // milliseconds
  };
  createdAt: Date;
}

interface Chapter {
  title: string;
  content: string;
  events: string[]; // event IDs
  startTime: Date;
  endTime: Date;
}

interface NarrativeStyle {
  voice: 'first_person' | 'third_person' | 'omniscient';
  tone: 'formal' | 'casual' | 'technical' | 'poetic';
  detail: 'minimal' | 'moderate' | 'detailed';
}

// ============================================================================
// Narrator Agent
// ============================================================================

export class NarratorAgent extends BaseAgent {
  // Event buffer for narrative construction
  private eventBuffer: Event[] = [];

  // Generated narratives
  private narratives: Map<string, Narrative> = new Map();

  // Default style
  private defaultStyle: NarrativeStyle = {
    voice: 'third_person',
    tone: 'casual',
    detail: 'moderate',
  };

  // Theme detection keywords
  private themeKeywords: Record<string, string[]> = {
    discovery: ['found', 'discovered', 'learned', 'new', 'unknown', 'explore'],
    creation: ['built', 'created', 'generated', 'made', 'produced'],
    challenge: ['error', 'failed', 'problem', 'fix', 'debug', 'issue'],
    success: ['completed', 'success', 'achieved', 'passed', 'working'],
    collaboration: ['together', 'team', 'help', 'assist', 'cooperate'],
    growth: ['improved', 'better', 'progress', 'evolved', 'learn'],
  };

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'narrator' }, bus);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['NARRATE', 'EVENT', 'QUERY', 'BROADCAST'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'NARRATE':
        return this.handleNarrateRequest(message);
      case 'EVENT':
        return this.handleEvent(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'BROADCAST':
        // Collect broadcasts as events
        this.collectEvent(message);
        return null;
      default:
        return null;
    }
  }

  // ============================================================================
  // Event Collection
  // ============================================================================

  private handleEvent(message: Message): Message | null {
    const event = this.createEvent(message.payload);
    this.eventBuffer.push(event);

    // Keep buffer manageable
    if (this.eventBuffer.length > 1000) {
      this.eventBuffer.shift();
    }

    return null;
  }

  private collectEvent(message: Message): void {
    const event: Event = {
      id: randomUUID().slice(0, 8),
      type: message.payload.type || 'broadcast',
      timestamp: new Date(),
      actors: [message.from],
      action: this.describeAction(message.payload),
      importance: message.payload.importance || 0.5,
      context: message.payload.context,
    };

    this.eventBuffer.push(event);
  }

  private createEvent(payload: any): Event {
    return {
      id: payload.id || randomUUID().slice(0, 8),
      type: payload.type || 'event',
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      actors: payload.actors || [],
      action: payload.action || payload.description || '',
      outcome: payload.outcome,
      context: payload.context,
      importance: payload.importance || 0.5,
    };
  }

  private describeAction(payload: any): string {
    if (payload.action) return payload.action;
    if (payload.description) return payload.description;
    if (payload.event) return payload.event;

    // Try to generate description from payload
    const keys = Object.keys(payload).filter((k) => k !== 'type');
    if (keys.length > 0) {
      return `${payload.type || 'action'}: ${keys.join(', ')}`;
    }

    return 'unknown action';
  }

  // ============================================================================
  // Narrative Generation
  // ============================================================================

  private async handleNarrateRequest(message: Message): Promise<Message | null> {
    const {
      events,
      timeRange,
      style,
      format,
    } = message.payload;

    // Get events to narrate
    let eventsToNarrate: Event[];

    if (events) {
      eventsToNarrate = events.map((e: any) => this.createEvent(e));
    } else if (timeRange) {
      eventsToNarrate = this.getEventsInRange(
        new Date(timeRange.start),
        new Date(timeRange.end)
      );
    } else {
      // Default: last 20 events
      eventsToNarrate = this.eventBuffer.slice(-20);
    }

    const narrative = this.generateNarrative(
      eventsToNarrate,
      style || this.defaultStyle,
      format
    );

    this.narratives.set(narrative.id, narrative);

    this.log(`Generated narrative: "${narrative.title}" (${narrative.chapters.length} chapters)`);

    return {
      ...this.createResponse(message, 'RESPONSE', { narrative }),
      id: '',
      timestamp: new Date(),
    };
  }

  private getEventsInRange(start: Date, end: Date): Event[] {
    return this.eventBuffer.filter(
      (e) => e.timestamp >= start && e.timestamp <= end
    );
  }

  generateNarrative(
    events: Event[],
    style: NarrativeStyle = this.defaultStyle,
    format?: 'summary' | 'detailed' | 'chapters'
  ): Narrative {
    if (events.length === 0) {
      return this.createEmptyNarrative();
    }

    // Sort events chronologically
    const sortedEvents = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Detect themes
    const themes = this.detectThemes(sortedEvents);

    // Generate title
    const title = this.generateTitle(sortedEvents, themes);

    // Generate chapters
    const chapters = this.generateChapters(sortedEvents, style);

    // Generate summary
    const summary = this.generateSummary(sortedEvents, chapters, style);

    const narrative: Narrative = {
      id: randomUUID(),
      title,
      summary,
      chapters,
      themes,
      timeline: {
        start: sortedEvents[0].timestamp,
        end: sortedEvents[sortedEvents.length - 1].timestamp,
        duration: sortedEvents[sortedEvents.length - 1].timestamp.getTime() -
                  sortedEvents[0].timestamp.getTime(),
      },
      createdAt: new Date(),
    };

    return narrative;
  }

  // ============================================================================
  // Theme Detection
  // ============================================================================

  private detectThemes(events: Event[]): string[] {
    const themeScores: Record<string, number> = {};

    // Initialize scores
    for (const theme of Object.keys(this.themeKeywords)) {
      themeScores[theme] = 0;
    }

    // Score themes based on keyword matches
    for (const event of events) {
      const text = `${event.action} ${event.outcome || ''} ${event.context || ''}`.toLowerCase();

      for (const [theme, keywords] of Object.entries(this.themeKeywords)) {
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            themeScores[theme] += event.importance || 0.5;
          }
        }
      }
    }

    // Return top themes
    return Object.entries(themeScores)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme]) => theme);
  }

  // ============================================================================
  // Title Generation
  // ============================================================================

  private generateTitle(events: Event[], themes: string[]): string {
    if (events.length === 0) return 'An Untold Story';

    const primaryTheme = themes[0] || 'journey';

    const titleTemplates: Record<string, string[]> = {
      discovery: ['The Discovery', 'Finding New Ground', 'Unveiled Secrets'],
      creation: ['Building Something New', 'The Creation', 'From Nothing to Something'],
      challenge: ['Overcoming Obstacles', 'The Struggle', 'Rising to the Challenge'],
      success: ['A Victory Achieved', 'Success Story', 'Mission Accomplished'],
      collaboration: ['Working Together', 'The Team Effort', 'Unity in Action'],
      growth: ['Growing Stronger', 'The Evolution', 'Path to Improvement'],
      journey: ['The Journey', 'What Happened', 'A Series of Events'],
    };

    const templates = titleTemplates[primaryTheme] || titleTemplates['journey'];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // ============================================================================
  // Chapter Generation
  // ============================================================================

  private generateChapters(events: Event[], style: NarrativeStyle): Chapter[] {
    const chapters: Chapter[] = [];

    // Group events into chapters by time gaps or natural breaks
    const groups = this.groupEvents(events);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const chapterContent = this.narrate(group, style);

      chapters.push({
        title: this.generateChapterTitle(group, i + 1),
        content: chapterContent,
        events: group.map((e) => e.id),
        startTime: group[0].timestamp,
        endTime: group[group.length - 1].timestamp,
      });
    }

    return chapters;
  }

  private groupEvents(events: Event[]): Event[][] {
    if (events.length === 0) return [];
    if (events.length <= 5) return [events];

    const groups: Event[][] = [];
    let currentGroup: Event[] = [events[0]];

    for (let i = 1; i < events.length; i++) {
      const prevEvent = events[i - 1];
      const currEvent = events[i];

      // Start new group if:
      // 1. Time gap > 5 minutes
      // 2. Different event type
      // 3. Group size > 10
      const timeGap = currEvent.timestamp.getTime() - prevEvent.timestamp.getTime();
      const typeChange = currEvent.type !== prevEvent.type;
      const groupFull = currentGroup.length >= 10;

      if (timeGap > 5 * 60 * 1000 || typeChange || groupFull) {
        groups.push(currentGroup);
        currentGroup = [currEvent];
      } else {
        currentGroup.push(currEvent);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private generateChapterTitle(events: Event[], chapterNumber: number): string {
    // Try to derive from most important event
    const mostImportant = events.reduce((max, e) =>
      (e.importance || 0) > (max.importance || 0) ? e : max
    , events[0]);

    if (mostImportant.type) {
      return `Chapter ${chapterNumber}: ${this.capitalize(mostImportant.type)}`;
    }

    return `Chapter ${chapterNumber}`;
  }

  // ============================================================================
  // Narrative Text Generation
  // ============================================================================

  private narrate(events: Event[], style: NarrativeStyle): string {
    const lines: string[] = [];

    for (const event of events) {
      lines.push(this.narrateEvent(event, style));
    }

    return lines.join('\n\n');
  }

  private narrateEvent(event: Event, style: NarrativeStyle): string {
    const actor = event.actors[0] || 'The system';
    const action = event.action;
    const outcome = event.outcome;

    let sentence = '';

    // Build sentence based on voice
    switch (style.voice) {
      case 'first_person':
        sentence = `I ${this.pastTense(action)}`;
        if (outcome) sentence += `, resulting in ${outcome}`;
        break;

      case 'third_person':
        sentence = `${actor} ${this.pastTense(action)}`;
        if (outcome) sentence += `, which led to ${outcome}`;
        break;

      case 'omniscient':
        sentence = `It came to pass that ${actor} ${this.pastTense(action)}`;
        if (outcome) sentence += `. The consequence was ${outcome}`;
        break;
    }

    // Adjust tone
    switch (style.tone) {
      case 'formal':
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
        break;
      case 'casual':
        sentence += '.';
        break;
      case 'technical':
        sentence = `[${event.type}] ` + sentence + '.';
        break;
      case 'poetic':
        sentence = '~ ' + sentence + ' ~';
        break;
    }

    // Add detail if requested
    if (style.detail === 'detailed' && event.context) {
      sentence += ` (Context: ${event.context})`;
    }

    return sentence;
  }

  private pastTense(action: string): string {
    // Very simple past tense conversion
    if (action.endsWith('e')) return action + 'd';
    if (action.endsWith('ed')) return action;
    return action + 'ed';
  }

  // ============================================================================
  // Summary Generation
  // ============================================================================

  private generateSummary(
    events: Event[],
    chapters: Chapter[],
    style: NarrativeStyle
  ): string {
    const eventCount = events.length;
    const actorSet = new Set<string>();
    events.forEach((e) => e.actors.forEach((a) => actorSet.add(a)));
    const actors = Array.from(actorSet);

    const duration = events.length > 1
      ? events[events.length - 1].timestamp.getTime() - events[0].timestamp.getTime()
      : 0;
    const durationStr = this.formatDuration(duration);

    let summary = '';

    switch (style.voice) {
      case 'first_person':
        summary = `Over ${durationStr}, I experienced ${eventCount} events across ${chapters.length} distinct phases.`;
        break;

      case 'third_person':
        summary = `This narrative covers ${eventCount} events spanning ${durationStr}. `;
        if (actors.length > 0) {
          summary += `The main actors were: ${actors.slice(0, 3).join(', ')}.`;
        }
        break;

      case 'omniscient':
        summary = `In the span of ${durationStr}, ${eventCount} significant events unfolded, `;
        summary += `shaping the course of ${chapters.length} chapters in this ongoing saga.`;
        break;
    }

    return summary;
  }

  private formatDuration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
    if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)} hours`;
    return `${Math.round(ms / 86400000)} days`;
  }

  private createEmptyNarrative(): Narrative {
    return {
      id: randomUUID(),
      title: 'The Quiet Moment',
      summary: 'Nothing of note occurred during this period.',
      chapters: [],
      themes: ['silence'],
      timeline: {
        start: new Date(),
        end: new Date(),
        duration: 0,
      },
      createdAt: new Date(),
    };
  }

  // ============================================================================
  // Query
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query, narrativeId, limit } = message.payload;

    if (query === 'narrative' && narrativeId) {
      const narrative = this.narratives.get(narrativeId);
      return {
        ...this.createResponse(message, 'RESPONSE', { narrative }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'recent') {
      const recent = Array.from(this.narratives.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit || 5);
      return {
        ...this.createResponse(message, 'RESPONSE', { narratives: recent }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'events') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          events: this.eventBuffer.slice(-(limit || 20)),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    return null;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats() {
    return {
      eventsBuffered: this.eventBuffer.length,
      narrativesGenerated: this.narratives.size,
      recentThemes: this.detectThemes(this.eventBuffer.slice(-50)),
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Public methods
  addEvent(event: Partial<Event>): void {
    this.eventBuffer.push(this.createEvent(event));
  }

  getEventBuffer(): Event[] {
    return [...this.eventBuffer];
  }

  setDefaultStyle(style: Partial<NarrativeStyle>): void {
    this.defaultStyle = { ...this.defaultStyle, ...style };
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('narrator', (bus) => new NarratorAgent(bus));

export function createNarratorAgent(bus?: MessageBus): NarratorAgent {
  return new NarratorAgent(bus);
}
