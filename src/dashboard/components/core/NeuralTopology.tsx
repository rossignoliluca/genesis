import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { useGenesisStore } from '../../stores/genesisStore';

interface NeuralTopologyProps {
  position?: [number, number, number];
  scale?: number;
}

interface Node {
  id: string;
  type: 'brain' | 'llm' | 'mcp' | 'agent';
  position: THREE.Vector3;
  color: THREE.Color;
  active: boolean;
}

interface Connection {
  from: string;
  to: string;
  strength: number;
}

// ============================================================================
// Neural Topology - 3D Agent Network Visualization
// ============================================================================

export function NeuralTopology({
  position = [0, 0, 0],
  scale = 1,
}: NeuralTopologyProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { agents } = useGenesisStore();

  // Generate network nodes
  const nodes = useMemo<Node[]>(() => {
    const result: Node[] = [];

    // Central brain node
    result.push({
      id: 'brain',
      type: 'brain',
      position: new THREE.Vector3(0, 0, 0),
      color: new THREE.Color('#00ff88'),
      active: true,
    });

    // LLM provider nodes (inner ring)
    const llmProviders = agents.providers || ['anthropic', 'openai'];
    llmProviders.forEach((provider, i) => {
      const angle = (i / llmProviders.length) * Math.PI * 2;
      result.push({
        id: `llm-${provider}`,
        type: 'llm',
        position: new THREE.Vector3(
          Math.cos(angle) * 1.5,
          Math.sin(angle) * 0.5,
          Math.sin(angle) * 1.5
        ),
        color: new THREE.Color(provider === 'anthropic' ? '#cc785c' : '#10a37f'),
        active: true,
      });
    });

    // Agent nodes (outer ring)
    const agentCount = Math.min(agents.active || 3, 8);
    for (let i = 0; i < agentCount; i++) {
      const angle = (i / agentCount) * Math.PI * 2 + Math.PI / agentCount;
      result.push({
        id: `agent-${i}`,
        type: 'agent',
        position: new THREE.Vector3(
          Math.cos(angle) * 2.5,
          Math.sin(angle * 2) * 0.3,
          Math.sin(angle) * 2.5
        ),
        color: new THREE.Color('#0088ff'),
        active: i < (agents.active || 0),
      });
    }

    // MCP server nodes (scattered)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      result.push({
        id: `mcp-${i}`,
        type: 'mcp',
        position: new THREE.Vector3(
          Math.cos(angle) * 2,
          1 + Math.sin(i) * 0.5,
          Math.sin(angle) * 2
        ),
        color: new THREE.Color('#aa66ff'),
        active: true,
      });
    }

    return result;
  }, [agents]);

  // Generate connections
  const connections = useMemo<Connection[]>(() => {
    const result: Connection[] = [];

    nodes.forEach((node) => {
      if (node.id !== 'brain') {
        // Connect all nodes to brain
        result.push({
          from: 'brain',
          to: node.id,
          strength: node.active ? 0.8 : 0.3,
        });
      }

      // Connect LLMs to agents
      if (node.type === 'llm') {
        nodes
          .filter((n) => n.type === 'agent')
          .forEach((agent) => {
            result.push({
              from: node.id,
              to: agent.id,
              strength: agent.active ? 0.5 : 0.1,
            });
          });
      }
    });

    return result;
  }, [nodes]);

  // Animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;

    // Gentle rotation
    groupRef.current.rotation.y = time * 0.1;
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Connections */}
      {connections.map((conn, i) => {
        const fromNode = nodes.find((n) => n.id === conn.from);
        const toNode = nodes.find((n) => n.id === conn.to);
        if (!fromNode || !toNode) return null;

        return (
          <ConnectionLine
            key={`conn-${i}`}
            start={fromNode.position}
            end={toNode.position}
            color={fromNode.color}
            strength={conn.strength}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => (
        <NetworkNode key={node.id} node={node} />
      ))}
    </group>
  );
}

// ============================================================================
// Network Node Component
// ============================================================================

function NetworkNode({ node }: { node: Node }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const size = useMemo(() => {
    switch (node.type) {
      case 'brain': return 0.3;
      case 'llm': return 0.2;
      case 'agent': return 0.15;
      case 'mcp': return 0.12;
      default: return 0.1;
    }
  }, [node.type]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;

    // Pulse effect for active nodes
    if (node.active) {
      const pulse = 1 + Math.sin(time * 3) * 0.1;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={node.position}>
      {/* Node sphere */}
      <Sphere ref={meshRef} args={[size, 16, 16]}>
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={node.active ? 0.5 : 0.1}
          roughness={0.3}
          metalness={0.7}
        />
      </Sphere>

      {/* Glow effect */}
      {node.active && (
        <Sphere args={[size * 1.5, 16, 16]}>
          <meshBasicMaterial
            color={node.color}
            transparent
            opacity={0.15}
          />
        </Sphere>
      )}
    </group>
  );
}

// ============================================================================
// Connection Line Component
// ============================================================================

function ConnectionLine({
  start,
  end,
  color,
  strength,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: THREE.Color;
  strength: number;
}) {
  const points = useMemo(() => {
    // Create curved line
    const mid = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.2, 0));

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return curve.getPoints(20);
  }, [start, end]);

  return (
    <Line
      points={points}
      color={color}
      lineWidth={strength * 2}
      transparent
      opacity={strength * 0.6}
    />
  );
}
