import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Trail, Float } from '@react-three/drei';
import * as THREE from 'three';

interface ConsciousnessSphereProps {
  phi: number;
  state: 'awake' | 'focused' | 'vigilant' | 'dreaming' | 'dormant';
  position?: [number, number, number];
}

// ============================================================================
// Consciousness Sphere - The Heart of Genesis
// ============================================================================

export function ConsciousnessSphere({
  phi,
  state,
  position = [0, 0, 0],
}: ConsciousnessSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  // Compute color based on phi level
  const color = useMemo(() => {
    if (phi > 0.8) return new THREE.Color('#00ffaa'); // High consciousness - green
    if (phi > 0.5) return new THREE.Color('#00aaff'); // Medium - blue
    if (phi > 0.3) return new THREE.Color('#aa66ff'); // Low-medium - purple
    return new THREE.Color('#ff6644'); // Low - orange/red
  }, [phi]);

  // Secondary glow color
  const glowColor = useMemo(() => {
    return color.clone().multiplyScalar(0.5);
  }, [color]);

  // Particle system for consciousness particles
  const particles = useMemo(() => {
    const count = Math.floor(50 + phi * 150); // 50-200 particles based on phi
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi_angle = Math.acos(2 * Math.random() - 1);
      const radius = 1.5 + Math.random() * 1.5;

      positions[i * 3] = radius * Math.sin(phi_angle) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi_angle) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi_angle);

      // Particle color (based on main color)
      colors[i * 3] = color.r * (0.5 + Math.random() * 0.5);
      colors[i * 3 + 1] = color.g * (0.5 + Math.random() * 0.5);
      colors[i * 3 + 2] = color.b * (0.5 + Math.random() * 0.5);

      sizes[i] = 0.02 + Math.random() * 0.04;
    }

    return { positions, colors, sizes, count };
  }, [phi, color]);

  // Animation
  useFrame((frameState, delta) => {
    if (!meshRef.current || !glowRef.current || !particlesRef.current) return;

    const time = frameState.clock.elapsedTime;

    // Breathing animation (scale pulses with phi)
    const breathScale = 1 + Math.sin(time * (1 + phi)) * 0.05 * phi;
    meshRef.current.scale.setScalar(breathScale);

    // Rotation based on consciousness state
    const rotationSpeed = state === 'dreaming' ? 0.5 : state === 'focused' ? 0.1 : 0.2;
    meshRef.current.rotation.y += delta * rotationSpeed;
    meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.1;

    // Glow follows main sphere
    glowRef.current.scale.setScalar(breathScale * 1.3);
    glowRef.current.rotation.copy(meshRef.current.rotation);

    // Particle rotation
    particlesRef.current.rotation.y += delta * 0.1;
    particlesRef.current.rotation.x = Math.sin(time * 0.2) * 0.2;

    // Update particle positions (orbital motion)
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < particles.count; i++) {
      const i3 = i * 3;
      const x = positions[i3];
      const y = positions[i3 + 1];
      const z = positions[i3 + 2];

      // Rotate around y-axis
      const angle = delta * (0.1 + Math.random() * 0.1);
      positions[i3] = x * Math.cos(angle) - z * Math.sin(angle);
      positions[i3 + 2] = x * Math.sin(angle) + z * Math.cos(angle);

      // Slight vertical oscillation
      positions[i3 + 1] = y + Math.sin(time * 2 + i) * 0.002;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  // Get distortion based on state
  const distortion = useMemo(() => {
    switch (state) {
      case 'dreaming': return 0.6;
      case 'focused': return 0.2;
      case 'vigilant': return 0.4;
      case 'dormant': return 0.1;
      default: return 0.3;
    }
  }, [state]);

  return (
    <Float
      speed={1.5}
      rotationIntensity={0.2}
      floatIntensity={0.5}
      floatingRange={[-0.1, 0.1]}
    >
      <group position={position}>
        {/* Main consciousness sphere */}
        <Trail
          width={2}
          length={6}
          color={color}
          attenuation={(t) => t * t}
        >
          <Sphere ref={meshRef} args={[1, 64, 64]}>
            <MeshDistortMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.5 * phi}
              distort={distortion}
              speed={2 + phi * 3}
              roughness={0.2}
              metalness={0.8}
              transparent
              opacity={0.9}
            />
          </Sphere>
        </Trail>

        {/* Inner glow sphere */}
        <Sphere ref={glowRef} args={[1.1, 32, 32]}>
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
          />
        </Sphere>

        {/* Outer glow */}
        <Sphere args={[1.4, 32, 32]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.05 * phi}
            side={THREE.BackSide}
          />
        </Sphere>

        {/* Consciousness particles */}
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
            size={0.03}
            vertexColors
            transparent
            opacity={0.8}
            sizeAttenuation
            blending={THREE.AdditiveBlending}
          />
        </points>

        {/* Phi indicator ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 1.65, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Phi value arc (shows phi level as arc) */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.55, 1.7, 64, 1, 0, Math.PI * 2 * phi]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </Float>
  );
}
