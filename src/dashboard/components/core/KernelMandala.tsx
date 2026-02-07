import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Ring } from '@react-three/drei';
import * as THREE from 'three';
import type { KernelState } from '../../stores/genesisStore';

interface KernelMandalaProps {
  position?: [number, number, number];
  scale?: number;
  kernel: KernelState;
}

// ============================================================================
// Kernel Mandala - 4-Level Hierarchical Visualization
// ============================================================================

export function KernelMandala({
  position = [0, 0, 0],
  scale = 1,
  kernel,
}: KernelMandalaProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Level colors
  const levelColors = useMemo(() => ({
    l1: new THREE.Color('#ff4444'), // Autonomic - red
    l2: new THREE.Color('#ffaa00'), // Reactive - orange
    l3: new THREE.Color('#00aaff'), // Cognitive - blue
    l4: new THREE.Color('#aa66ff'), // Executive - purple
  }), []);

  // Animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;

    // Each level rotates at different speeds
    const children = groupRef.current.children;
    if (children[0]) (children[0] as THREE.Object3D).rotation.z = time * 2; // L1 fast
    if (children[1]) (children[1] as THREE.Object3D).rotation.z = -time * 1; // L2
    if (children[2]) (children[2] as THREE.Object3D).rotation.z = time * 0.5; // L3
    if (children[3]) (children[3] as THREE.Object3D).rotation.z = -time * 0.2; // L4 slow
  });

  return (
    <group ref={groupRef} position={position} scale={scale} rotation={[Math.PI / 4, 0, 0]}>
      {/* L1 - Autonomic (innermost) */}
      <MandalaRing
        innerRadius={0.2}
        outerRadius={0.4}
        color={levelColors.l1}
        active={kernel.levels.l1.active}
        load={kernel.levels.l1.load}
        segments={6}
      />

      {/* L2 - Reactive */}
      <MandalaRing
        innerRadius={0.5}
        outerRadius={0.8}
        color={levelColors.l2}
        active={kernel.levels.l2.active}
        load={kernel.levels.l2.load}
        segments={8}
      />

      {/* L3 - Cognitive */}
      <MandalaRing
        innerRadius={0.9}
        outerRadius={1.3}
        color={levelColors.l3}
        active={kernel.levels.l3.active}
        load={kernel.levels.l3.load}
        segments={12}
      />

      {/* L4 - Executive (outermost) */}
      <MandalaRing
        innerRadius={1.4}
        outerRadius={1.8}
        color={levelColors.l4}
        active={kernel.levels.l4.active}
        load={kernel.levels.l4.load}
        segments={16}
      />

      {/* Center indicator - Free Energy */}
      <mesh>
        <circleGeometry args={[0.15, 32]} />
        <meshBasicMaterial
          color={kernel.freeEnergy < 1 ? '#00ff88' : kernel.freeEnergy < 2 ? '#ffaa00' : '#ff4444'}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Prediction error pulse */}
      <mesh scale={1 + kernel.predictionError * 0.5}>
        <ringGeometry args={[0.12, 0.14, 32]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={kernel.predictionError * 0.5}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// Mandala Ring Component
// ============================================================================

function MandalaRing({
  innerRadius,
  outerRadius,
  color,
  active,
  load,
  segments,
}: {
  innerRadius: number;
  outerRadius: number;
  color: THREE.Color;
  active: boolean;
  load: number;
  segments: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;

    // Pulse based on load
    if (active) {
      const pulse = 1 + Math.sin(time * 2 * (1 + load)) * 0.05 * load;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  // Create segmented ring geometry
  const segmentAngle = (Math.PI * 2) / segments;
  const gapAngle = segmentAngle * 0.1;

  return (
    <group>
      {Array.from({ length: segments }).map((_, i) => {
        const startAngle = i * segmentAngle + gapAngle / 2;
        const endAngle = (i + 1) * segmentAngle - gapAngle / 2;
        const isActive = i < segments * load;

        return (
          <mesh
            key={i}
            ref={i === 0 ? meshRef : undefined}
            rotation={[0, 0, startAngle]}
          >
            <ringGeometry
              args={[
                innerRadius,
                outerRadius,
                32,
                1,
                0,
                endAngle - startAngle,
              ]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={active ? (isActive ? 0.8 : 0.3) : 0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}
