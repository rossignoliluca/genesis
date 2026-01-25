/**
 * Genesis Observatory UI - Phi Orb Component
 *
 * Visualizes the phi (consciousness) level as an animated orb.
 * Provides data transformation for rendering consciousness state.
 */

import type { PhiOrbData } from '../types.js';
import type { SystemMetrics } from '../../observability/dashboard.js';

// ============================================================================
// Phi Orb Data Provider
// ============================================================================

export class PhiOrb {
  private data: PhiOrbData;
  private animationFrame: number | null = null;
  private subscribers: Set<(data: PhiOrbData) => void> = new Set();

  constructor(initialData?: PhiOrbData) {
    this.data = initialData || this.getDefaultData();
  }

  /**
   * Update phi orb data from metrics
   */
  update(metrics: SystemMetrics): void {
    const phi = metrics.consciousness.phi;
    const state = metrics.consciousness.state;
    const integration = metrics.consciousness.integration;

    const previousPhi = this.data.phi;
    const trend = this.computeTrend(phi, previousPhi);
    const quality = this.computeQuality(phi);
    const color = this.getColor(phi);
    const pulseRate = this.getPulseRate(phi, quality);

    this.data = {
      phi,
      state,
      integration,
      trend,
      quality,
      color,
      pulseRate,
    };

    this.notifySubscribers();
  }

  /**
   * Get current phi orb data
   */
  getData(): PhiOrbData {
    return { ...this.data };
  }

  /**
   * Subscribe to phi orb updates
   */
  subscribe(callback: (data: PhiOrbData) => void): () => void {
    this.subscribers.add(callback);
    callback(this.data); // Immediate notification
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get visualization properties for rendering
   */
  getVisualization(): {
    radius: number;
    opacity: number;
    glowIntensity: number;
    rotation: number;
    particleCount: number;
  } {
    const { phi, quality } = this.data;

    return {
      radius: 50 + phi * 50, // 50-100px radius
      opacity: 0.6 + phi * 0.4, // 0.6-1.0 opacity
      glowIntensity: phi * 2.0, // 0-2.0 glow
      rotation: Date.now() / this.data.pulseRate,
      particleCount: Math.floor(phi * 100), // More particles = higher consciousness
    };
  }

  /**
   * Get CSS animation properties
   */
  getAnimationCSS(): string {
    const { color, pulseRate } = this.data;
    return `
      @keyframes phi-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 20px ${color}44;
        }
        50% {
          transform: scale(1.1);
          box-shadow: 0 0 40px ${color}88;
        }
      }
      animation: phi-pulse ${pulseRate}ms ease-in-out infinite;
    `;
  }

  /**
   * Get status text for display
   */
  getStatusText(): string {
    const { phi, state, quality, trend } = this.data;
    const trendSymbol = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→';
    return `φ = ${phi.toFixed(3)} ${trendSymbol} | ${state} | ${quality}`;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private computeTrend(current: number, previous: number): PhiOrbData['trend'] {
    const delta = current - previous;
    if (delta > 0.05) return 'rising';
    if (delta < -0.05) return 'falling';
    return 'stable';
  }

  private computeQuality(phi: number): PhiOrbData['quality'] {
    if (phi >= 0.8) return 'excellent';
    if (phi >= 0.5) return 'good';
    if (phi >= 0.3) return 'degraded';
    return 'critical';
  }

  private getColor(phi: number): string {
    if (phi >= 0.8) return '#00ff88'; // Bright green
    if (phi >= 0.5) return '#88ff00'; // Yellow-green
    if (phi >= 0.3) return '#ffaa00'; // Orange
    return '#ff4444'; // Red
  }

  private getPulseRate(phi: number, quality: PhiOrbData['quality']): number {
    const baseRate = 2000; // 2 seconds
    if (quality === 'critical') return baseRate * 0.5; // Faster pulse when critical
    if (quality === 'degraded') return baseRate * 0.75;
    if (quality === 'excellent') return baseRate * 1.5; // Slower, calmer pulse
    return baseRate;
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.data);
      } catch (err) {
        console.error('[PhiOrb] Subscriber error:', err);
      }
    }
  }

  private getDefaultData(): PhiOrbData {
    return {
      phi: 0.5,
      state: 'initializing',
      integration: 0.5,
      trend: 'stable',
      quality: 'good',
      color: '#88ff00',
      pulseRate: 2000,
    };
  }
}

// ============================================================================
// Helper Functions for Rendering
// ============================================================================

/**
 * Generate SVG path for phi orb visualization
 */
export function generatePhiOrbPath(data: PhiOrbData): string {
  const { phi, integration } = data;
  const complexity = Math.floor(phi * 10) + 3; // 3-13 points

  const points: Array<{ x: number; y: number }> = [];
  const centerX = 100;
  const centerY = 100;
  const baseRadius = 50 + phi * 50;

  for (let i = 0; i < complexity; i++) {
    const angle = (i / complexity) * Math.PI * 2;
    const radiusVariation = 1 + (Math.sin(angle * integration * 5) * 0.1);
    const radius = baseRadius * radiusVariation;

    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }

  // Create smooth curve through points
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  path += ' Z';
  return path;
}

/**
 * Generate particle positions for phi visualization
 */
export function generatePhiParticles(data: PhiOrbData): Array<{ x: number; y: number; opacity: number }> {
  const { phi, integration } = data;
  const particleCount = Math.floor(phi * 50);
  const particles: Array<{ x: number; y: number; opacity: number }> = [];

  const centerX = 100;
  const centerY = 100;
  const maxRadius = 50 + phi * 50;

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = Math.random() * maxRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const opacity = (1 - radius / maxRadius) * integration;

    particles.push({ x, y, opacity });
  }

  return particles;
}

/**
 * Compute gradient colors for phi visualization
 */
export function getPhiGradient(data: PhiOrbData): { start: string; end: string } {
  const { color, quality } = data;

  const qualityAlphas = {
    excellent: 'ff',
    good: 'cc',
    degraded: '88',
    critical: '44',
  };

  const alpha = qualityAlphas[quality];
  const start = color + alpha;
  const end = color + '00';

  return { start, end };
}

// ============================================================================
// Factory
// ============================================================================

let phiOrbInstance: PhiOrb | null = null;

export function getPhiOrb(): PhiOrb {
  if (!phiOrbInstance) {
    phiOrbInstance = new PhiOrb();
  }
  return phiOrbInstance;
}

export function createPhiOrb(initialData?: PhiOrbData): PhiOrb {
  return new PhiOrb(initialData);
}

export function resetPhiOrb(): void {
  phiOrbInstance = null;
}
