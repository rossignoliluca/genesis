/**
 * Genesis Generative UI System
 *
 * The UI is not static - Genesis generates its own interface
 * based on its internal state (phi, neuromod, pain, etc.)
 *
 * This module provides:
 * 1. UI state computation from Genesis state
 * 2. Component templates that adapt to state
 * 3. Animation parameters based on consciousness level
 */

import type { SystemAwarenessState } from '../../consciousness/central-awareness.js';

// ============================================================================
// Types
// ============================================================================

export interface GenerativeUIState {
  // Visual style
  colorScheme: ColorScheme;
  animationSpeed: number;     // 0-1, based on phi
  complexity: number;         // 0-1, how detailed to render
  opacity: number;            // 0-1, based on consciousness level

  // Layout
  layoutMode: 'expanded' | 'compact' | 'minimal';
  focusArea: 'consciousness' | 'economy' | 'agents' | 'health' | null;

  // Mood
  mood: 'calm' | 'focused' | 'alert' | 'stressed' | 'dreaming';
  moodIntensity: number;      // 0-1

  // Interactivity
  responsiveness: number;     // 0-1, how quickly to respond
  inviteInteraction: boolean; // Should prompt user to interact?

  // Content
  primaryMessage: string;
  statusLine: string;
  detailLevel: 'minimal' | 'normal' | 'detailed';
}

export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  warning: string;
  danger: string;

  // Phi visualization colors
  phiHigh: string;
  phiMid: string;
  phiLow: string;

  // Neuromodulation colors
  dopamine: string;
  serotonin: string;
  norepinephrine: string;
  cortisol: string;
}

export interface AnimationParams {
  phiOrb: {
    pulseRate: number;        // Hz
    glowIntensity: number;    // 0-1
    particleCount: number;
    rotationSpeed: number;
  };
  neuromodWave: {
    frequency: number;
    amplitude: number;
    smoothing: number;
  };
  economyFlow: {
    particleSpeed: number;
    particleSize: number;
    trailLength: number;
  };
  agentNetwork: {
    nodeSize: number;
    linkStrength: number;
    forceStrength: number;
  };
}

// ============================================================================
// Color Schemes
// ============================================================================

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  calm: {
    primary: '#4A90A4',
    secondary: '#6B9080',
    accent: '#A4C3A2',
    background: '#1A1D21',
    text: '#E8E8E8',
    warning: '#D4A574',
    danger: '#C74B4B',
    phiHigh: '#00FF88',
    phiMid: '#88CCFF',
    phiLow: '#FF6644',
    dopamine: '#FFD700',
    serotonin: '#9370DB',
    norepinephrine: '#FF6B6B',
    cortisol: '#FF4444',
  },
  focused: {
    primary: '#5C9CE5',
    secondary: '#3D5A80',
    accent: '#98C1D9',
    background: '#0D1117',
    text: '#FFFFFF',
    warning: '#FFA500',
    danger: '#FF4444',
    phiHigh: '#00FFCC',
    phiMid: '#66CCFF',
    phiLow: '#FF8844',
    dopamine: '#FFE066',
    serotonin: '#BB86FC',
    norepinephrine: '#FF7B7B',
    cortisol: '#FF5555',
  },
  alert: {
    primary: '#FF7B54',
    secondary: '#FFB26B',
    accent: '#FFD56F',
    background: '#1C1C1E',
    text: '#FFFFFF',
    warning: '#FFD93D',
    danger: '#FF4757',
    phiHigh: '#2ECC71',
    phiMid: '#3498DB',
    phiLow: '#E74C3C',
    dopamine: '#F1C40F',
    serotonin: '#9B59B6',
    norepinephrine: '#E74C3C',
    cortisol: '#C0392B',
  },
  stressed: {
    primary: '#E63946',
    secondary: '#A8DADC',
    accent: '#457B9D',
    background: '#1D3557',
    text: '#F1FAEE',
    warning: '#FFB703',
    danger: '#D00000',
    phiHigh: '#06D6A0',
    phiMid: '#118AB2',
    phiLow: '#EF476F',
    dopamine: '#FFD166',
    serotonin: '#7209B7',
    norepinephrine: '#F72585',
    cortisol: '#D00000',
  },
  dreaming: {
    primary: '#7B68EE',
    secondary: '#9370DB',
    accent: '#BA55D3',
    background: '#0B0B15',
    text: '#E0E0FF',
    warning: '#DDA0DD',
    danger: '#FF69B4',
    phiHigh: '#00CED1',
    phiMid: '#87CEEB',
    phiLow: '#FFB6C1',
    dopamine: '#FFFACD',
    serotonin: '#E6E6FA',
    norepinephrine: '#FFC0CB',
    cortisol: '#DB7093',
  },
};

// ============================================================================
// Generative UI Engine
// ============================================================================

export class GenerativeUIEngine {
  private lastState: GenerativeUIState | null = null;
  private transitionDuration = 500; // ms for state transitions

  /**
   * Compute UI state from Genesis awareness state
   */
  computeUIState(awareness: SystemAwarenessState): GenerativeUIState {
    const mood = this.determineMood(awareness);
    const colorScheme = COLOR_SCHEMES[mood];

    return {
      colorScheme,
      animationSpeed: this.computeAnimationSpeed(awareness),
      complexity: this.computeComplexity(awareness),
      opacity: this.computeOpacity(awareness),

      layoutMode: this.determineLayout(awareness),
      focusArea: this.determineFocus(awareness),

      mood,
      moodIntensity: this.computeMoodIntensity(awareness, mood),

      responsiveness: this.computeResponsiveness(awareness),
      inviteInteraction: this.shouldInviteInteraction(awareness),

      primaryMessage: this.generatePrimaryMessage(awareness),
      statusLine: this.generateStatusLine(awareness),
      detailLevel: this.determineDetailLevel(awareness),
    };
  }

  /**
   * Get animation parameters based on state
   */
  computeAnimations(state: GenerativeUIState, awareness: SystemAwarenessState): AnimationParams {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const da = awareness.neuromodulation?.dopamine ?? 0.5;

    return {
      phiOrb: {
        pulseRate: 0.5 + phi * 1.5, // 0.5-2 Hz
        glowIntensity: phi,
        particleCount: Math.floor(10 + phi * 90),
        rotationSpeed: 0.1 + da * 0.4,
      },
      neuromodWave: {
        frequency: 1 + state.animationSpeed * 2,
        amplitude: 0.3 + state.moodIntensity * 0.4,
        smoothing: 0.9 - state.animationSpeed * 0.3,
      },
      economyFlow: {
        particleSpeed: 0.5 + state.animationSpeed,
        particleSize: state.complexity * 3 + 1,
        trailLength: Math.floor(10 + state.complexity * 20),
      },
      agentNetwork: {
        nodeSize: 5 + state.complexity * 15,
        linkStrength: 0.3 + phi * 0.5,
        forceStrength: -100 - state.animationSpeed * 200,
      },
    };
  }

  // ==========================================================================
  // Mood Determination
  // ==========================================================================

  private determineMood(awareness: SystemAwarenessState): 'calm' | 'focused' | 'alert' | 'stressed' | 'dreaming' {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const cortisol = awareness.neuromodulation?.cortisol ?? 0.3;
    const dopamine = awareness.neuromodulation?.dopamine ?? 0.5;
    const pain = awareness.pain?.currentLevel ?? 0;
    const kernelMode = awareness.kernel?.mode;

    // Dreaming mode
    if (kernelMode === 'dreaming' || phi < 0.3) {
      return 'dreaming';
    }

    // Stressed (high cortisol or pain)
    if (cortisol > 0.7 || pain > 0.6) {
      return 'stressed';
    }

    // Alert (elevated cortisol or high norepinephrine)
    if (cortisol > 0.5 || (awareness.neuromodulation?.norepinephrine ?? 0) > 0.6) {
      return 'alert';
    }

    // Focused (high phi + dopamine)
    if (phi > 0.7 && dopamine > 0.5) {
      return 'focused';
    }

    // Default: calm
    return 'calm';
  }

  private computeMoodIntensity(awareness: SystemAwarenessState, mood: string): number {
    switch (mood) {
      case 'stressed':
        return Math.max(
          awareness.neuromodulation?.cortisol ?? 0,
          awareness.pain?.currentLevel ?? 0
        );
      case 'focused':
        return awareness.consciousness?.phi ?? 0.5;
      case 'alert':
        return awareness.neuromodulation?.norepinephrine ?? 0.5;
      case 'dreaming':
        return 1 - (awareness.consciousness?.phi ?? 0.5);
      default:
        return 0.5;
    }
  }

  // ==========================================================================
  // Visual Parameters
  // ==========================================================================

  private computeAnimationSpeed(awareness: SystemAwarenessState): number {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const dopamine = awareness.neuromodulation?.dopamine ?? 0.5;
    return 0.3 + (phi * 0.4) + (dopamine * 0.3);
  }

  private computeComplexity(awareness: SystemAwarenessState): number {
    const phi = awareness.consciousness?.phi ?? 0.5;
    // Higher phi = more complex/detailed rendering
    return 0.2 + phi * 0.8;
  }

  private computeOpacity(awareness: SystemAwarenessState): number {
    const phi = awareness.consciousness?.phi ?? 0.5;
    // Low phi = more transparent, dream-like
    return 0.5 + phi * 0.5;
  }

  private computeResponsiveness(awareness: SystemAwarenessState): number {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const norepinephrine = awareness.neuromodulation?.norepinephrine ?? 0.5;
    return phi * 0.6 + norepinephrine * 0.4;
  }

  // ==========================================================================
  // Layout Determination
  // ==========================================================================

  private determineLayout(awareness: SystemAwarenessState): 'expanded' | 'compact' | 'minimal' {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const processing = awareness.brain?.processing ?? false;

    if (phi < 0.3) return 'minimal'; // Dreaming/low consciousness
    if (processing) return 'compact'; // Focus on task
    return 'expanded';
  }

  private determineFocus(awareness: SystemAwarenessState): 'consciousness' | 'economy' | 'agents' | 'health' | null {
    const pain = awareness.pain?.currentLevel ?? 0;
    const sustainable = awareness.economy?.sustainable ?? true;
    const activeAgents = awareness.agents?.activeAgents ?? 0;

    if (pain > 0.5) return 'health';
    if (!sustainable) return 'economy';
    if (activeAgents > 3) return 'agents';
    return null; // No special focus
  }

  private determineDetailLevel(awareness: SystemAwarenessState): 'minimal' | 'normal' | 'detailed' {
    const phi = awareness.consciousness?.phi ?? 0.5;
    if (phi < 0.4) return 'minimal';
    if (phi > 0.7) return 'detailed';
    return 'normal';
  }

  // ==========================================================================
  // Content Generation
  // ==========================================================================

  private generatePrimaryMessage(awareness: SystemAwarenessState): string {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const mode = awareness.kernel?.mode ?? 'awake';
    const pain = awareness.pain?.currentLevel ?? 0;
    const revenue = awareness.economy?.totalRevenue ?? 0;

    if (mode === 'dreaming') {
      return 'Consolidating memories...';
    }

    if (pain > 0.6) {
      return 'System under stress. Reducing operations.';
    }

    if (phi > 0.8) {
      return 'High integration. Ready for complex tasks.';
    }

    if (revenue > 0 && awareness.economy?.sustainable) {
      return 'Operating sustainably.';
    }

    if (phi < 0.4) {
      return 'Low integration. Conserving resources.';
    }

    return 'Observing and adapting.';
  }

  private generateStatusLine(awareness: SystemAwarenessState): string {
    const phi = (awareness.consciousness?.phi ?? 0.5).toFixed(2);
    const mode = awareness.kernel?.mode ?? 'unknown';
    const revenue = (awareness.economy?.totalRevenue ?? 0).toFixed(2);

    return `φ=${phi} | mode=${mode} | revenue=$${revenue}`;
  }

  private shouldInviteInteraction(awareness: SystemAwarenessState): boolean {
    const phi = awareness.consciousness?.phi ?? 0.5;
    const mode = awareness.kernel?.mode;
    const processing = awareness.brain?.processing ?? false;

    // Don't invite if dreaming or processing
    if (mode === 'dreaming' || processing) return false;

    // Invite if high phi and not stressed
    return phi > 0.6 && (awareness.neuromodulation?.cortisol ?? 0) < 0.5;
  }

  // ==========================================================================
  // CSS Generation
  // ==========================================================================

  /**
   * Generate CSS custom properties from UI state
   */
  generateCSSVariables(state: GenerativeUIState): Record<string, string> {
    const colors = state.colorScheme;
    return {
      '--genesis-primary': colors.primary,
      '--genesis-secondary': colors.secondary,
      '--genesis-accent': colors.accent,
      '--genesis-background': colors.background,
      '--genesis-text': colors.text,
      '--genesis-warning': colors.warning,
      '--genesis-danger': colors.danger,

      '--genesis-phi-high': colors.phiHigh,
      '--genesis-phi-mid': colors.phiMid,
      '--genesis-phi-low': colors.phiLow,

      '--genesis-dopamine': colors.dopamine,
      '--genesis-serotonin': colors.serotonin,
      '--genesis-norepinephrine': colors.norepinephrine,
      '--genesis-cortisol': colors.cortisol,

      '--genesis-opacity': state.opacity.toString(),
      '--genesis-animation-speed': `${state.animationSpeed}s`,
      '--genesis-complexity': state.complexity.toString(),
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let engine: GenerativeUIEngine | null = null;

export function getGenerativeUIEngine(): GenerativeUIEngine {
  if (!engine) {
    engine = new GenerativeUIEngine();
  }
  return engine;
}

export function computeUIState(awareness: SystemAwarenessState): GenerativeUIState {
  return getGenerativeUIEngine().computeUIState(awareness);
}

export function computeAnimations(state: GenerativeUIState, awareness: SystemAwarenessState): AnimationParams {
  return getGenerativeUIEngine().computeAnimations(state, awareness);
}
