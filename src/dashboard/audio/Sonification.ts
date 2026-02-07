// ============================================================================
// Genesis Sonification System - Data to Sound
// ============================================================================

export interface SonificationState {
  phi: number;           // 0-1: consciousness level
  freeEnergy: number;    // 0-5: prediction error
  dopamine: number;      // 0-1
  serotonin: number;     // 0-1
  norepinephrine: number; // 0-1
  cortisol: number;      // 0-1
  agentActivity: number; // 0-1: ratio of active agents
  mode: string;          // operating mode
}

export class GenesisSonification {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying = false;
  private oscillators: Map<string, OscillatorNode> = new Map();
  private gains: Map<string, GainNode> = new Map();
  private lastState: SonificationState | null = null;

  // Drone oscillators for ambient sound
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneOsc3: OscillatorNode | null = null;
  private droneLFO: OscillatorNode | null = null;

  // Pulse for heartbeat
  private pulseInterval: number | null = null;

  constructor() {
    // AudioContext will be created on user interaction
  }

  private initAudioContext() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.3; // Master volume
    this.masterGain.connect(this.audioContext.destination);
  }

  async start() {
    if (this.isPlaying) return;

    this.initAudioContext();
    if (!this.audioContext || !this.masterGain) return;

    // Resume context if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.setupDroneLayer();
    this.setupPulseLayer();
  }

  stop() {
    this.isPlaying = false;

    // Stop all oscillators
    this.oscillators.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    this.oscillators.clear();
    this.gains.clear();

    if (this.droneOsc1) try { this.droneOsc1.stop(); } catch {}
    if (this.droneOsc2) try { this.droneOsc2.stop(); } catch {}
    if (this.droneOsc3) try { this.droneOsc3.stop(); } catch {}
    if (this.droneLFO) try { this.droneLFO.stop(); } catch {}

    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = null;
    }
  }

  toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // ============================================================================
  // Drone Layer - Ambient consciousness sound
  // ============================================================================

  private setupDroneLayer() {
    if (!this.audioContext || !this.masterGain) return;

    // Base drone - represents consciousness
    const droneGain1 = this.audioContext.createGain();
    droneGain1.gain.value = 0.08;
    droneGain1.connect(this.masterGain);

    this.droneOsc1 = this.audioContext.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.value = 55; // A1 - base consciousness
    this.droneOsc1.connect(droneGain1);
    this.droneOsc1.start();
    this.gains.set('drone1', droneGain1);

    // Second harmonic
    const droneGain2 = this.audioContext.createGain();
    droneGain2.gain.value = 0.04;
    droneGain2.connect(this.masterGain);

    this.droneOsc2 = this.audioContext.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.value = 110; // A2
    this.droneOsc2.connect(droneGain2);
    this.droneOsc2.start();
    this.gains.set('drone2', droneGain2);

    // Third - higher consciousness indicator
    const droneGain3 = this.audioContext.createGain();
    droneGain3.gain.value = 0.02;
    droneGain3.connect(this.masterGain);

    this.droneOsc3 = this.audioContext.createOscillator();
    this.droneOsc3.type = 'triangle';
    this.droneOsc3.frequency.value = 220; // A3
    this.droneOsc3.connect(droneGain3);
    this.droneOsc3.start();
    this.gains.set('drone3', droneGain3);

    // LFO for subtle modulation
    const lfoGain = this.audioContext.createGain();
    lfoGain.gain.value = 2;
    lfoGain.connect(this.droneOsc1.frequency);

    this.droneLFO = this.audioContext.createOscillator();
    this.droneLFO.type = 'sine';
    this.droneLFO.frequency.value = 0.1; // Very slow modulation
    this.droneLFO.connect(lfoGain);
    this.droneLFO.start();
  }

  // ============================================================================
  // Pulse Layer - Kernel heartbeat
  // ============================================================================

  private setupPulseLayer() {
    if (!this.audioContext || !this.masterGain) return;

    // Heartbeat pulse every ~2 seconds (simulating kernel cycle)
    this.pulseInterval = window.setInterval(() => {
      if (!this.isPlaying || !this.audioContext || !this.masterGain) return;
      this.playPulse();
    }, 2000);
  }

  private playPulse() {
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;

    // Create pulse oscillator
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 80;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  // ============================================================================
  // Update with Genesis State
  // ============================================================================

  update(state: SonificationState) {
    if (!this.isPlaying || !this.audioContext) return;
    this.lastState = state;

    const now = this.audioContext.currentTime;

    // Update drone frequencies based on phi
    if (this.droneOsc1) {
      // Higher phi = higher pitch (more "awake" sound)
      const baseFreq = 55 + state.phi * 30; // 55-85 Hz
      this.droneOsc1.frequency.setTargetAtTime(baseFreq, now, 0.5);
    }

    if (this.droneOsc2) {
      const harmonic = 110 + state.phi * 60;
      this.droneOsc2.frequency.setTargetAtTime(harmonic, now, 0.5);
    }

    if (this.droneOsc3) {
      // Third oscillator more responsive to phi
      const high = 220 + state.phi * 110;
      this.droneOsc3.frequency.setTargetAtTime(high, now, 0.5);

      // Volume based on phi
      const gain3 = this.gains.get('drone3');
      if (gain3) {
        gain3.gain.setTargetAtTime(0.01 + state.phi * 0.04, now, 0.3);
      }
    }

    // Neuromodulator effects
    this.updateNeuromodulatorSound(state, now);

    // Free energy affects dissonance
    this.updateFreeEnergySound(state, now);
  }

  private updateNeuromodulatorSound(state: SonificationState, now: number) {
    if (!this.droneLFO) return;

    // LFO speed based on norepinephrine (attention/arousal)
    const lfoSpeed = 0.05 + state.norepinephrine * 0.2;
    this.droneLFO.frequency.setTargetAtTime(lfoSpeed, now, 0.5);

    // Dopamine increases brightness (higher harmonics)
    const gain3 = this.gains.get('drone3');
    if (gain3) {
      const brightness = 0.01 + state.dopamine * 0.03 + state.phi * 0.02;
      gain3.gain.setTargetAtTime(brightness, now, 0.3);
    }

    // Cortisol adds tension (slight detuning)
    if (this.droneOsc2) {
      const detune = state.cortisol * 15; // Up to 15 cents sharp when stressed
      this.droneOsc2.detune.setTargetAtTime(detune, now, 0.5);
    }
  }

  private updateFreeEnergySound(state: SonificationState, now: number) {
    // High free energy = dissonance/tension
    if (this.droneOsc3 && state.freeEnergy > 1.5) {
      // Add slight dissonance when prediction error is high
      const dissonance = (state.freeEnergy - 1.5) * 10;
      this.droneOsc3.detune.setTargetAtTime(dissonance, now, 0.3);
    } else if (this.droneOsc3) {
      this.droneOsc3.detune.setTargetAtTime(0, now, 0.3);
    }
  }

  // ============================================================================
  // Event Sounds
  // ============================================================================

  playAlert(type: 'warning' | 'error' | 'success' | 'info') {
    if (!this.audioContext || !this.masterGain) {
      this.initAudioContext();
    }
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.masterGain);

    switch (type) {
      case 'success':
        // Rising tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'warning':
        // Two-tone warning
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(400, now + 0.1);
        osc.frequency.setValueAtTime(600, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;

      case 'error':
        // Low descending tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.3);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case 'info':
        // Soft ping
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
    }
  }

  playAgentActivation() {
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;

    // Quick ascending arpeggio
    const notes = [330, 440, 550, 660];
    notes.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      const startTime = now + i * 0.05;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  playModeChange(mode: string) {
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;

    // Different chord based on mode
    let frequencies: number[];
    switch (mode.toLowerCase()) {
      case 'active':
        frequencies = [261.63, 329.63, 392]; // C major
        break;
      case 'dream':
        frequencies = [220, 261.63, 329.63]; // A minor
        break;
      case 'agony':
        frequencies = [220, 277.18, 329.63]; // A diminished
        break;
      default:
        frequencies = [261.63, 311.13, 392]; // C sus4
    }

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1 - i * 0.02, now + 0.1);
      gain.gain.setValueAtTime(0.1 - i * 0.02, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + 1.5);
    });
  }

  // ============================================================================
  // Volume Control
  // ============================================================================

  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  getVolume(): number {
    return this.masterGain?.gain.value ?? 0.3;
  }
}

// Singleton instance
export const sonification = new GenesisSonification();
