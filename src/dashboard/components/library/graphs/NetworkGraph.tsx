/**
 * NetworkGraph - Force-directed network graph visualization
 *
 * Uses D3 force simulation for layout.
 */
import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';

interface GraphNode {
  id: string;
  label?: string;
  group?: string;
  size?: number;
  color?: string;
}

interface GraphLink {
  source: string;
  target: string;
  strength?: number;
  label?: string;
}

interface NetworkGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  width?: number;
  height?: number;
  showLabels?: boolean;
  interactive?: boolean;
  groupColors?: Record<string, string>;
}

export function NetworkGraph({
  nodes,
  links,
  width = 400,
  height = 300,
  showLabels = true,
  interactive = true,
  groupColors = {},
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [simulation, setSimulation] = useState<d3.Simulation<any, any> | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Default colors for groups
  const defaultColors: Record<string, string> = {
    default: '#888888',
    primary: '#00ff88',
    secondary: '#ff8800',
    tertiary: '#8888ff',
    warning: '#ffaa00',
    error: '#ff4444',
    ...groupColors,
  };

  // Create simulation
  useEffect(() => {
    if (!svgRef.current) return;

    // Clone data for simulation
    const simNodes = nodes.map((n) => ({ ...n }));
    const simLinks = links.map((l) => ({ ...l }));

    const sim = d3
      .forceSimulation(simNodes as any)
      .force(
        'link',
        d3
          .forceLink(simLinks as any)
          .id((d: any) => d.id)
          .distance(50)
          .strength((d: any) => d.strength || 0.5)
      )
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20));

    setSimulation(sim);

    return () => {
      sim.stop();
    };
  }, [nodes, links, width, height]);

  // Render
  const renderedNodes = useMemo(() => {
    if (!simulation) return [];
    return simulation.nodes();
  }, [simulation]);

  const renderedLinks = useMemo(() => {
    if (!simulation) return [];
    const linkForce = simulation.force('link') as d3.ForceLink<any, any>;
    return linkForce?.links() || [];
  }, [simulation]);

  // Force re-render on tick
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!simulation) return;

    simulation.on('tick', () => {
      setTick((t) => t + 1);
    });

    return () => {
      simulation.on('tick', null);
    };
  }, [simulation]);

  const getNodeColor = (node: GraphNode) => {
    if (node.color) return node.color;
    if (node.group && defaultColors[node.group]) return defaultColors[node.group];
    return defaultColors.default;
  };

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg ref={svgRef} width={width} height={height}>
        <defs>
          <filter id="node-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.3)" />
          </marker>
        </defs>

        {/* Links */}
        <g className="links">
          {renderedLinks.map((link: any, i: number) => {
            const isHighlighted =
              selectedNode === link.source.id || selectedNode === link.target.id;

            return (
              <line
                key={i}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke={isHighlighted ? '#00ff88' : 'rgba(255,255,255,0.2)'}
                strokeWidth={isHighlighted ? 2 : 1}
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g className="nodes">
          {renderedNodes.map((node: any) => {
            const color = getNodeColor(node);
            const size = node.size || 8;
            const isSelected = selectedNode === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                style={{ cursor: interactive ? 'pointer' : 'default' }}
                onClick={() => interactive && setSelectedNode(isSelected ? null : node.id)}
              >
                {/* Selection ring */}
                {isSelected && (
                  <motion.circle
                    r={size + 6}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  />
                )}

                {/* Node circle */}
                <circle
                  r={size}
                  fill={color}
                  filter="url(#node-glow)"
                  opacity={selectedNode && !isSelected ? 0.5 : 1}
                />

                {/* Label */}
                {showLabels && node.label && (
                  <text
                    y={size + 12}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.7)"
                    fontSize={10}
                  >
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Selected node info */}
      {selectedNode && (
        <motion.div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(0,0,0,0.8)',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            minWidth: 120,
          }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            {nodes.find((n) => n.id === selectedNode)?.label || selectedNode}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)' }}>
            Connections: {links.filter((l) => l.source === selectedNode || l.target === selectedNode).length}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * TreeGraph - Hierarchical tree visualization
 */
interface TreeNode {
  id: string;
  label?: string;
  children?: TreeNode[];
  collapsed?: boolean;
}

interface TreeGraphProps {
  data: TreeNode;
  width?: number;
  height?: number;
  orientation?: 'horizontal' | 'vertical';
}

export function TreeGraph({
  data,
  width = 400,
  height = 300,
  orientation = 'horizontal',
}: TreeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert to d3 hierarchy
  const root = useMemo(() => {
    return d3.hierarchy(data);
  }, [data]);

  // Create tree layout
  const treeLayout = useMemo(() => {
    const layout =
      orientation === 'horizontal'
        ? d3.tree<TreeNode>().size([height - 40, width - 100])
        : d3.tree<TreeNode>().size([width - 40, height - 100]);

    return layout(root);
  }, [root, width, height, orientation]);

  // Generate link path
  const linkGenerator =
    orientation === 'horizontal'
      ? d3
          .linkHorizontal<any, any>()
          .x((d) => d.y + 50)
          .y((d) => d.x + 20)
      : d3
          .linkVertical<any, any>()
          .x((d) => d.x + 20)
          .y((d) => d.y + 50);

  return (
    <svg ref={svgRef} width={width} height={height}>
      {/* Links */}
      <g className="links">
        {treeLayout.links().map((link, i) => (
          <path
            key={i}
            d={linkGenerator(link) || ''}
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1.5}
          />
        ))}
      </g>

      {/* Nodes */}
      <g className="nodes">
        {treeLayout.descendants().map((node) => {
          const x = orientation === 'horizontal' ? node.y + 50 : node.x + 20;
          const y = orientation === 'horizontal' ? node.x + 20 : node.y + 50;

          return (
            <g key={node.data.id} transform={`translate(${x}, ${y})`}>
              <circle r={6} fill="#00ff88" />
              <text
                dx={10}
                dy={4}
                fill="rgba(255,255,255,0.8)"
                fontSize={11}
              >
                {node.data.label || node.data.id}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
