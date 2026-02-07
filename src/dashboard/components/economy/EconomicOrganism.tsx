import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Torus } from '@react-three/drei';
import * as THREE from 'three';
import type { EconomyState } from '../../stores/genesisStore';

interface EconomicOrganismProps {
  economy: EconomyState;
  position?: [number, number, number];
  scale?: number;
}

// ============================================================================
// Economic Organism - Living visualization of economic health
// ============================================================================

export function EconomicOrganism({
  economy,
  position = [0, 0, 0],
  scale = 1,
}: EconomicOrganismProps) {
  const heartRef = useRef<THREE.Mesh>(null);
  const arteryRef = useRef<THREE.Mesh>(null);
  const veinRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Health color based on NESS
  const healthColor = useMemo(() => {
    if (economy.ness > 0.7) return new THREE.Color('#00ff88');
    if (economy.ness > 0.4) return new THREE.Color('#ffaa00');
    return new THREE.Color('#ff4444');
  }, [economy.ness]);

  // Cash flow determines heartbeat speed
  const heartbeatSpeed = useMemo(() => {
    const cashFlow = economy.revenue - economy.costs;
    if (cashFlow > 0) return 2 + cashFlow / 100; // Faster when profitable
    return 1; // Slower when losing money
  }, [economy.revenue, economy.costs]);

  useFrame((state) => {
    if (!heartRef.current || !groupRef.current) return;
    const time = state.clock.elapsedTime;

    // Heartbeat animation
    const beat = Math.sin(time * heartbeatSpeed * Math.PI) * 0.5 + 0.5;
    const scale = 1 + beat * 0.15 * economy.ness;
    heartRef.current.scale.setScalar(scale);

    // Artery pulse (revenue flow)
    if (arteryRef.current) {
      arteryRef.current.rotation.z = time * 0.5;
    }

    // Vein pulse (cost flow)
    if (veinRef.current) {
      veinRef.current.rotation.z = -time * 0.3;
    }

    // Gentle group rotation
    groupRef.current.rotation.y = time * 0.1;
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Heart (core) */}
      <Sphere ref={heartRef} args={[0.4, 32, 32]}>
        <meshStandardMaterial
          color={healthColor}
          emissive={healthColor}
          emissiveIntensity={0.5}
          roughness={0.3}
          metalness={0.7}
        />
      </Sphere>

      {/* Artery ring (revenue) */}
      <Torus ref={arteryRef} args={[0.7, 0.05, 16, 32]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={economy.revenue / 1000}
          transparent
          opacity={0.7}
        />
      </Torus>

      {/* Vein ring (costs) */}
      <Torus ref={veinRef} args={[0.9, 0.04, 16, 32]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color="#ff4444"
          emissive="#ff4444"
          emissiveIntensity={economy.costs / 1000}
          transparent
          opacity={0.5}
        />
      </Torus>

      {/* Outer NESS indicator */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.15, 64, 1, 0, Math.PI * 2 * economy.ness]} />
        <meshBasicMaterial
          color={healthColor}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Runway indicator particles */}
      <RunwayParticles runway={economy.runway} />
    </group>
  );
}

// ============================================================================
// Runway Particles
// ============================================================================

function RunwayParticles({ runway }: { runway: number }) {
  const particlesRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const count = Math.min(50, Math.floor(runway));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const radius = 1.3 + Math.random() * 0.3;

      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 2] = Math.sin(theta) * radius;

      // Color based on runway health
      const health = runway > 30 ? 1 : runway > 7 ? 0.5 : 0;
      colors[i * 3] = health < 0.5 ? 1 : 0;
      colors[i * 3 + 1] = health > 0.5 ? 1 : health > 0 ? 0.7 : 0;
      colors[i * 3 + 2] = 0;
    }

    return { positions, colors, count };
  }, [runway]);

  useFrame((state) => {
    if (!particlesRef.current) return;
    particlesRef.current.rotation.y = state.clock.elapsedTime * 0.2;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particles.count}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}
