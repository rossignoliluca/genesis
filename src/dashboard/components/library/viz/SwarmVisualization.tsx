/**
 * SwarmVisualization - 3D visualization of swarm agents
 *
 * Uses React Three Fiber for WebGL rendering.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface SwarmAgent {
  id: string;
  role: string;
  status: 'active' | 'idle' | 'busy';
  position?: [number, number, number];
  velocity?: [number, number, number];
  load: number;
  contribution: number;
}

interface SwarmVisualizationProps {
  agents: SwarmAgent[];
  patterns?: { id: string; type: string; strength: number; participants: number }[];
  width?: number;
  height?: number;
  showConnections?: boolean;
  rotateCamera?: boolean;
}

// Agent mesh component
function AgentMesh({
  agent,
  position,
}: {
  agent: SwarmAgent;
  position: [number, number, number];
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const roleColors: Record<string, string> = {
    explorer: '#00ff88',
    exploiter: '#ff8800',
    coordinator: '#8888ff',
    specialist: '#ff00ff',
    default: '#ffffff',
  };

  const color = roleColors[agent.role] || roleColors.default;

  // Animate based on status
  useFrame((state) => {
    if (meshRef.current) {
      // Pulse effect for active agents
      if (agent.status === 'active') {
        meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.1);
      }
      // Gentle float
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.1;
    }
  });

  const size = 0.1 + agent.contribution * 0.2;

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={agent.status === 'active' ? 0.5 : 0.1}
        transparent
        opacity={agent.status === 'idle' ? 0.5 : 1}
      />
    </mesh>
  );
}

// Connection lines between agents
function ConnectionLines({
  agents,
  positions,
}: {
  agents: SwarmAgent[];
  positions: Map<string, [number, number, number]>;
}) {
  const lines = useMemo(() => {
    const result: { start: [number, number, number]; end: [number, number, number]; strength: number }[] = [];

    // Connect agents based on proximity and role compatibility
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const p1 = positions.get(agents[i].id);
        const p2 = positions.get(agents[j].id);
        if (!p1 || !p2) continue;

        const distance = Math.sqrt(
          Math.pow(p1[0] - p2[0], 2) +
          Math.pow(p1[1] - p2[1], 2) +
          Math.pow(p1[2] - p2[2], 2)
        );

        if (distance < 2) {
          result.push({
            start: p1,
            end: p2,
            strength: 1 - distance / 2,
          });
        }
      }
    }

    return result;
  }, [agents, positions]);

  return (
    <>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[line.start, line.end]}
          color="#00ff8840"
          lineWidth={line.strength * 2}
          transparent
          opacity={line.strength * 0.5}
        />
      ))}
    </>
  );
}

// Main 3D scene
function SwarmScene({
  agents,
  showConnections,
  rotateCamera,
}: {
  agents: SwarmAgent[];
  showConnections: boolean;
  rotateCamera: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Generate positions for agents in a sphere distribution
  const positions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    agents.forEach((agent, i) => {
      const y = 1 - (i / (agents.length - 1)) * 2;
      const radius = Math.sqrt(1 - y * y) * 2;
      const theta = phi * i;

      map.set(agent.id, [
        Math.cos(theta) * radius,
        y * 2,
        Math.sin(theta) * radius,
      ]);
    });

    return map;
  }, [agents]);

  // Rotate the entire scene slowly
  useFrame((state) => {
    if (groupRef.current && rotateCamera) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Agents */}
      {agents.map((agent) => {
        const pos = positions.get(agent.id);
        if (!pos) return null;
        return <AgentMesh key={agent.id} agent={agent} position={pos} />;
      })}

      {/* Connections */}
      {showConnections && <ConnectionLines agents={agents} positions={positions} />}

      {/* Center core */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial
          color="#4488ff"
          emissive="#4488ff"
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
}

export function SwarmVisualization({
  agents,
  patterns,
  width = 400,
  height = 300,
  showConnections = true,
  rotateCamera = true,
}: SwarmVisualizationProps) {
  return (
    <div style={{ position: 'relative', width, height }}>
      <Canvas
        camera={{ position: [0, 2, 5], fov: 60 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4488ff" />

        <SwarmScene
          agents={agents}
          showConnections={showConnections}
          rotateCamera={rotateCamera}
        />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          maxDistance={10}
          minDistance={3}
          autoRotate={rotateCamera}
          autoRotateSpeed={0.5}
        />
      </Canvas>

      {/* Legend overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          display: 'flex',
          gap: 12,
          fontSize: 10,
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        <span style={{ color: '#00ff88' }}>● Explorer</span>
        <span style={{ color: '#ff8800' }}>● Exploiter</span>
        <span style={{ color: '#8888ff' }}>● Coordinator</span>
        <span style={{ color: '#ff00ff' }}>● Specialist</span>
      </div>

      {/* Pattern indicators */}
      {patterns && patterns.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 8,
            padding: 8,
            fontSize: 11,
          }}
        >
          <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
            Emergent Patterns
          </div>
          {patterns.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 8, color: '#00ff88', marginBottom: 4 }}>
              <span>{p.type}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                {(p.strength * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
