import React, { useRef, useEffect } from 'react';
import type { NeuromodState } from '../../stores/genesisStore';

interface NeuromodAuroraProps {
  neuromod: NeuromodState;
}

// ============================================================================
// Neuromodulation Aurora - Animated Gradient Visualization
// ============================================================================

export function NeuromodAurora({ neuromod }: NeuromodAuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = 80;
    };
    resize();
    window.addEventListener('resize', resize);

    // Animation
    let time = 0;
    const animate = () => {
      time += 0.02;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create flowing aurora effect
      const { dopamine, serotonin, norepinephrine, cortisol } = neuromod;

      // Draw each neuromodulator as a wave
      drawWave(ctx, canvas.width, canvas.height, time, dopamine, '#00ff88', 0);
      drawWave(ctx, canvas.width, canvas.height, time, serotonin, '#0066ff', 0.5);
      drawWave(ctx, canvas.width, canvas.height, time, norepinephrine, '#ffcc00', 1);
      drawWave(ctx, canvas.width, canvas.height, time, cortisol, '#ff4488', 1.5);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [neuromod]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          width: '100%',
          height: '80px',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
      {/* Neuromod labels */}
      <div
        style={{
          position: 'absolute',
          bottom: 145,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: '32px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <NeuromodLabel
          label="DA"
          value={neuromod.dopamine}
          color="#00ff88"
        />
        <NeuromodLabel
          label="5HT"
          value={neuromod.serotonin}
          color="#0066ff"
        />
        <NeuromodLabel
          label="NE"
          value={neuromod.norepinephrine}
          color="#ffcc00"
        />
        <NeuromodLabel
          label="CORT"
          value={neuromod.cortisol}
          color="#ff4488"
        />
      </div>
    </>
  );
}

// ============================================================================
// Wave Drawing Function
// ============================================================================

function drawWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  amplitude: number,
  color: string,
  offset: number
) {
  ctx.beginPath();

  const points = 100;
  const baseY = height * 0.6;

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width;
    const frequency = 0.02 + amplitude * 0.01;
    const waveAmplitude = amplitude * height * 0.4;

    // Complex wave with multiple harmonics
    const y =
      baseY +
      Math.sin(x * frequency + time + offset) * waveAmplitude * 0.5 +
      Math.sin(x * frequency * 2 + time * 1.5 + offset) * waveAmplitude * 0.3 +
      Math.sin(x * frequency * 0.5 + time * 0.5 + offset) * waveAmplitude * 0.2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}00`);
  gradient.addColorStop(0.5, `${color}${Math.floor(amplitude * 80).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(1, `${color}00`);

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw line on top
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width;
    const frequency = 0.02 + amplitude * 0.01;
    const waveAmplitude = amplitude * height * 0.4;

    const y =
      baseY +
      Math.sin(x * frequency + time + offset) * waveAmplitude * 0.5 +
      Math.sin(x * frequency * 2 + time * 1.5 + offset) * waveAmplitude * 0.3 +
      Math.sin(x * frequency * 0.5 + time * 0.5 + offset) * waveAmplitude * 0.2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.strokeStyle = `${color}88`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ============================================================================
// Neuromod Label Component
// ============================================================================

function NeuromodLabel({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <span
        style={{
          fontSize: '10px',
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color,
        }}
      >
        {(value * 100).toFixed(0)}%
      </span>
      <div
        style={{
          width: '40px',
          height: '4px',
          background: '#222',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${value * 100}%`,
            height: '100%',
            background: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
