/**
 * ToolDAGPanel - Tool Execution DAG Visualization
 *
 * Phase 2.4: Visualizes parallel tool execution as a directed acyclic graph.
 * Shows dependencies, execution status, and parallelism savings.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DAGNode {
  id: string;
  tool: string;
  dependsOn: string[];
  status: 'pending' | 'running' | 'success' | 'error';
  duration?: number;
  output?: unknown;
  error?: string;
}

interface ToolDAGPanelProps {
  nodes: DAGNode[];
  parallelSaved?: number;
  onNodeClick?: (node: DAGNode) => void;
}

const STATUS_COLORS = {
  pending: { bg: 'bg-gray-600', ring: 'ring-gray-500', text: 'text-gray-400' },
  running: { bg: 'bg-yellow-500', ring: 'ring-yellow-400', text: 'text-yellow-400' },
  success: { bg: 'bg-green-500', ring: 'ring-green-400', text: 'text-green-400' },
  error: { bg: 'bg-red-500', ring: 'ring-red-400', text: 'text-red-400' },
};

export const ToolDAGPanel: React.FC<ToolDAGPanelProps> = ({
  nodes,
  parallelSaved = 0,
  onNodeClick,
}) => {
  // Build layers for visualization
  const layers = useMemo(() => {
    const result: DAGNode[][] = [];
    const placed = new Set<string>();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Find nodes with no dependencies (layer 0)
    const getRemainingNodes = () => nodes.filter(n => !placed.has(n.id));

    while (placed.size < nodes.length) {
      const remaining = getRemainingNodes();
      const layer: DAGNode[] = [];

      for (const node of remaining) {
        // Check if all dependencies are placed
        const depsPlaced = node.dependsOn.every(d => placed.has(d));
        if (depsPlaced || node.dependsOn.length === 0) {
          layer.push(node);
        }
      }

      if (layer.length === 0 && remaining.length > 0) {
        // Circular dependency or orphan - add remaining
        layer.push(...remaining);
      }

      layer.forEach(n => placed.add(n.id));
      if (layer.length > 0) {
        result.push(layer);
      }
    }

    return result;
  }, [nodes]);

  // Calculate positions for nodes and edges
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; layer: number }>();
    const layerSpacing = 120;
    const nodeSpacing = 80;

    layers.forEach((layer, layerIndex) => {
      const layerWidth = layer.length * nodeSpacing;
      const startX = -layerWidth / 2 + nodeSpacing / 2;

      layer.forEach((node, nodeIndex) => {
        positions.set(node.id, {
          x: startX + nodeIndex * nodeSpacing,
          y: layerIndex * layerSpacing,
          layer: layerIndex,
        });
      });
    });

    return positions;
  }, [layers]);

  if (nodes.length === 0) {
    return null;
  }

  const viewBoxWidth = 400;
  const viewBoxHeight = Math.max(200, (layers.length + 1) * 120);

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <span className="text-sm font-medium text-white">Tool Execution DAG</span>
        </div>
        {parallelSaved > 0 && (
          <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded">
            {parallelSaved}ms saved via parallelism
          </span>
        )}
      </div>

      {/* DAG Visualization */}
      <div className="p-4 overflow-auto">
        <svg
          viewBox={`${-viewBoxWidth / 2} -20 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-auto min-h-[150px]"
          style={{ maxHeight: '300px' }}
        >
          {/* Draw edges first (behind nodes) */}
          {nodes.map(node =>
            node.dependsOn.map(depId => {
              const fromPos = nodePositions.get(depId);
              const toPos = nodePositions.get(node.id);
              if (!fromPos || !toPos) return null;

              return (
                <motion.path
                  key={`${depId}-${node.id}`}
                  d={`M ${fromPos.x} ${fromPos.y + 20} Q ${(fromPos.x + toPos.x) / 2} ${(fromPos.y + toPos.y) / 2} ${toPos.x} ${toPos.y - 20}`}
                  fill="none"
                  stroke="#4B5563"
                  strokeWidth={2}
                  strokeDasharray={node.status === 'pending' ? '5,5' : 'none'}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />
              );
            })
          )}

          {/* Draw nodes */}
          {nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;

            const colors = STATUS_COLORS[node.status];

            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                onClick={() => onNodeClick?.(node)}
                className="cursor-pointer"
              >
                {/* Node circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={20}
                  className={`${colors.bg} fill-current`}
                  strokeWidth={2}
                  stroke={node.status === 'running' ? '#F59E0B' : 'transparent'}
                >
                  {node.status === 'running' && (
                    <animate
                      attributeName="stroke-opacity"
                      values="1;0.3;1"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>

                {/* Status icon */}
                {node.status === 'running' && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={16}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-yellow-400"
                    strokeDasharray="30 70"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`0 ${pos.x} ${pos.y}`}
                      to={`360 ${pos.x} ${pos.y}`}
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {node.status === 'success' && (
                  <path
                    d={`M ${pos.x - 8} ${pos.y} L ${pos.x - 2} ${pos.y + 6} L ${pos.x + 8} ${pos.y - 6}`}
                    fill="none"
                    stroke="white"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {node.status === 'error' && (
                  <>
                    <line x1={pos.x - 6} y1={pos.y - 6} x2={pos.x + 6} y2={pos.y + 6} stroke="white" strokeWidth={3} strokeLinecap="round" />
                    <line x1={pos.x + 6} y1={pos.y - 6} x2={pos.x - 6} y2={pos.y + 6} stroke="white" strokeWidth={3} strokeLinecap="round" />
                  </>
                )}

                {/* Tool name label */}
                <text
                  x={pos.x}
                  y={pos.y + 35}
                  textAnchor="middle"
                  className="text-xs fill-gray-400"
                  fontFamily="monospace"
                >
                  {node.tool.length > 12 ? `${node.tool.slice(0, 10)}...` : node.tool}
                </text>

                {/* Duration label */}
                {node.duration !== undefined && (
                  <text
                    x={pos.x}
                    y={pos.y + 48}
                    textAnchor="middle"
                    className="text-xs fill-gray-500"
                  >
                    {node.duration}ms
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-gray-700 bg-gray-800/30">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${colors.bg}`} />
            <span className={`text-xs ${colors.text} capitalize`}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToolDAGPanel;
