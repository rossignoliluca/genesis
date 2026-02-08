/**
 * SankeyDiagram - Flow diagram for showing resource/data flows
 *
 * Perfect for neuromodulator effects, resource allocation, etc.
 */
import { useMemo } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';
import { motion } from 'framer-motion';

interface SankeyNodeData {
  id: string;
  label: string;
  color?: string;
}

interface SankeyLinkData {
  source: string;
  target: string;
  value: number;
}

interface SankeyDiagramProps {
  nodes: SankeyNodeData[];
  links: SankeyLinkData[];
  width?: number;
  height?: number;
  nodeWidth?: number;
  nodePadding?: number;
}

export function SankeyDiagram({
  nodes,
  links,
  width = 600,
  height = 400,
  nodeWidth = 15,
  nodePadding = 10,
}: SankeyDiagramProps) {
  const { sankeyNodes, sankeyLinks } = useMemo(() => {
    // Create node index map
    const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));

    // Convert to d3-sankey format
    const sankeyData = sankey<SankeyNodeData, SankeyLinkData>()
      .nodeId((d: any) => d.id)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[1, 1], [width - 1, height - 6]]);

    const graph = sankeyData({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({
        ...l,
        source: l.source as any,
        target: l.target as any,
      })),
    });

    return {
      sankeyNodes: graph.nodes,
      sankeyLinks: graph.links,
    };
  }, [nodes, links, width, height, nodeWidth, nodePadding]);

  const linkGenerator = sankeyLinkHorizontal();

  return (
    <svg width={width} height={height}>
      <defs>
        {sankeyLinks.map((link: any, i) => {
          const sourceNode = link.source as any;
          const targetNode = link.target as any;
          const sourceColor = sourceNode.color || '#888888';
          const targetColor = targetNode.color || '#888888';

          return (
            <linearGradient
              key={i}
              id={`link-gradient-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={sourceNode.x1}
              x2={targetNode.x0}
            >
              <stop offset="0%" stopColor={sourceColor} stopOpacity="0.5" />
              <stop offset="100%" stopColor={targetColor} stopOpacity="0.5" />
            </linearGradient>
          );
        })}
      </defs>

      {/* Links */}
      <g>
        {sankeyLinks.map((link: any, i) => (
          <motion.path
            key={i}
            d={linkGenerator(link) || ''}
            fill="none"
            stroke={`url(#link-gradient-${i})`}
            strokeWidth={Math.max(1, link.width)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            transition={{ delay: i * 0.05 }}
          />
        ))}
      </g>

      {/* Nodes */}
      <g>
        {sankeyNodes.map((node: any) => (
          <g key={node.id}>
            <motion.rect
              x={node.x0}
              y={node.y0}
              width={node.x1 - node.x0}
              height={node.y1 - node.y0}
              fill={node.color || '#00ff88'}
              rx={2}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.5 }}
              style={{ transformOrigin: `${node.x0}px ${(node.y0 + node.y1) / 2}px` }}
            />
            <text
              x={node.x0 < width / 2 ? node.x1 + 6 : node.x0 - 6}
              y={(node.y0 + node.y1) / 2}
              textAnchor={node.x0 < width / 2 ? 'start' : 'end'}
              alignmentBaseline="middle"
              fill="rgba(255,255,255,0.8)"
              fontSize={11}
            >
              {node.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
