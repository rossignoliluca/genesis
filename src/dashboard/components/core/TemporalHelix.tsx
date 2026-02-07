import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface Event {
  id: string;
  timestamp: number;
  type: string;
  importance: number;
}

interface TemporalHelixProps {
  events?: Event[];
  position?: [number, number, number];
  scale?: number;
}

// ============================================================================
// Temporal Helix - DNA-like timeline visualization
// ============================================================================

export function TemporalHelix({
  events = [],
  position = [0, 0, 0],
  scale = 1,
}: TemporalHelixProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Generate helix geometry
  const helix = useMemo(() => {
    const strand1: THREE.Vector3[] = [];
    const strand2: THREE.Vector3[] = [];
    const connections: Array<{ start: THREE.Vector3; end: THREE.Vector3 }> = [];

    const turns = 3;
    const points = 100;
    const height = 4;
    const radius = 0.5;

    for (let i = 0; i < points; i++) {
      const t = i / points;
      const angle = t * Math.PI * 2 * turns;
      const y = (t - 0.5) * height;

      // Strand 1
      const x1 = Math.cos(angle) * radius;
      const z1 = Math.sin(angle) * radius;
      strand1.push(new THREE.Vector3(x1, y, z1));

      // Strand 2 (offset by PI)
      const x2 = Math.cos(angle + Math.PI) * radius;
      const z2 = Math.sin(angle + Math.PI) * radius;
      strand2.push(new THREE.Vector3(x2, y, z2));

      // Connections (every 10 points)
      if (i % 10 === 0) {
        connections.push({
          start: new THREE.Vector3(x1, y, z1),
          end: new THREE.Vector3(x2, y, z2),
        });
      }
    }

    return { strand1, strand2, connections };
  }, []);

  // Event markers
  const eventMarkers = useMemo(() => {
    return events.slice(0, 20).map((event, i) => {
      const t = i / 20;
      const angle = t * Math.PI * 2 * 3;
      const y = (t - 0.5) * 4;
      const radius = 0.5;

      return {
        position: new THREE.Vector3(
          Math.cos(angle) * radius * 1.3,
          y,
          Math.sin(angle) * radius * 1.3
        ),
        color: getEventColor(event.type),
        size: 0.05 + event.importance * 0.1,
      };
    });
  }, [events]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;

    // Slow rotation
    groupRef.current.rotation.y = time * 0.1;
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Strand 1 */}
      <Line
        points={helix.strand1}
        color="#00ff88"
        lineWidth={2}
        transparent
        opacity={0.8}
      />

      {/* Strand 2 */}
      <Line
        points={helix.strand2}
        color="#0088ff"
        lineWidth={2}
        transparent
        opacity={0.8}
      />

      {/* Connections (rungs) */}
      {helix.connections.map((conn, i) => (
        <Line
          key={i}
          points={[conn.start, conn.end]}
          color="#aa66ff"
          lineWidth={1}
          transparent
          opacity={0.4}
        />
      ))}

      {/* Event markers */}
      {eventMarkers.map((marker, i) => (
        <Sphere
          key={i}
          args={[marker.size, 8, 8]}
          position={marker.position}
        >
          <meshBasicMaterial
            color={marker.color}
            transparent
            opacity={0.8}
          />
        </Sphere>
      ))}

      {/* NOW indicator */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[0.6, 0.65, 32]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Labels */}
      <mesh position={[0, 2.2, 0]}>
        <planeGeometry args={[0.8, 0.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getEventColor(type: string): string {
  const colors: Record<string, string> = {
    action: '#00ff88',
    prediction: '#0088ff',
    error: '#ff4444',
    memory: '#aa66ff',
    decision: '#ffaa00',
  };
  return colors[type] || '#888888';
}
