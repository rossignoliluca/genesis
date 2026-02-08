/**
 * WorkspaceVisualization - Global Workspace Theory visualization
 *
 * Shows the cognitive workspace with contents, coalitions, and broadcasts.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';

interface WorkspaceItem {
  id: string;
  type: string;
  salience: number;
  content?: string;
}

interface Coalition {
  id: string;
  items: string[];
  strength: number;
  broadcasting?: boolean;
}

interface WorkspaceVisualizationProps {
  items: WorkspaceItem[];
  coalitions?: Coalition[];
  broadcastActive?: boolean;
  capacity?: number;
  size?: number;
}

export function WorkspaceVisualization({
  items,
  coalitions = [],
  broadcastActive = false,
  capacity = 7,
  size = 300,
}: WorkspaceVisualizationProps) {
  const center = size / 2;
  const workspaceRadius = size / 2 - 40;

  // Position items in a circle
  const itemPositions = useMemo(() => {
    return items.map((item, i) => {
      const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
      const distance = workspaceRadius * 0.6;
      return {
        ...item,
        x: center + Math.cos(angle) * distance,
        y: center + Math.sin(angle) * distance,
      };
    });
  }, [items, center, workspaceRadius]);

  // Find broadcasting coalition
  const broadcastingCoalition = coalitions.find((c) => c.broadcasting);

  // Type colors
  const typeColors: Record<string, string> = {
    percept: '#00ff88',
    memory: '#8888ff',
    thought: '#ff8800',
    goal: '#ff00ff',
    emotion: '#ff4488',
    default: '#888888',
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          {/* Broadcast gradient */}
          <radialGradient id="broadcast-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
          </radialGradient>

          {/* Workspace border gradient */}
          <linearGradient id="workspace-border" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#8888ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff8800" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Workspace boundary */}
        <circle
          cx={center}
          cy={center}
          r={workspaceRadius}
          fill="rgba(255,255,255,0.02)"
          stroke="url(#workspace-border)"
          strokeWidth={2}
          strokeDasharray="5,5"
        />

        {/* Capacity indicator ring */}
        <circle
          cx={center}
          cy={center}
          r={workspaceRadius + 10}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={4}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={workspaceRadius + 10}
          fill="none"
          stroke={items.length >= capacity ? '#ff4444' : '#00ff88'}
          strokeWidth={4}
          strokeDasharray={`${(items.length / capacity) * 2 * Math.PI * (workspaceRadius + 10)}, ${2 * Math.PI * (workspaceRadius + 10)}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          animate={{
            strokeDasharray: `${(items.length / capacity) * 2 * Math.PI * (workspaceRadius + 10)}, ${2 * Math.PI * (workspaceRadius + 10)}`,
          }}
        />

        {/* Broadcasting wave effect */}
        {broadcastActive && (
          <>
            <motion.circle
              cx={center}
              cy={center}
              r={workspaceRadius * 0.3}
              fill="url(#broadcast-gradient)"
              animate={{
                r: [workspaceRadius * 0.3, workspaceRadius],
                opacity: [0.8, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
              }}
            />
            <motion.circle
              cx={center}
              cy={center}
              r={workspaceRadius * 0.3}
              fill="url(#broadcast-gradient)"
              animate={{
                r: [workspaceRadius * 0.3, workspaceRadius],
                opacity: [0.8, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: 0.5,
              }}
            />
          </>
        )}

        {/* Coalition connections */}
        {coalitions.map((coalition) => {
          const coalitionItems = itemPositions.filter((item) =>
            coalition.items.includes(item.id)
          );

          if (coalitionItems.length < 2) return null;

          // Draw connections between coalition members
          const connections: JSX.Element[] = [];
          for (let i = 0; i < coalitionItems.length; i++) {
            for (let j = i + 1; j < coalitionItems.length; j++) {
              connections.push(
                <motion.line
                  key={`${coalition.id}-${i}-${j}`}
                  x1={coalitionItems[i].x}
                  y1={coalitionItems[i].y}
                  x2={coalitionItems[j].x}
                  y2={coalitionItems[j].y}
                  stroke={coalition.broadcasting ? '#00ff88' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={coalition.strength * 3}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: coalition.strength }}
                />
              );
            }
          }
          return <g key={coalition.id}>{connections}</g>;
        })}

        {/* Workspace items */}
        <AnimatePresence>
          {itemPositions.map((item) => {
            const color = typeColors[item.type] || typeColors.default;
            const itemSize = 8 + item.salience * 12;
            const isInBroadcast = broadcastingCoalition?.items.includes(item.id);

            return (
              <motion.g
                key={item.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                {/* Glow for high salience */}
                {item.salience > 0.7 && (
                  <motion.circle
                    cx={item.x}
                    cy={item.y}
                    r={itemSize + 5}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.3}
                    animate={{
                      r: [itemSize + 5, itemSize + 10, itemSize + 5],
                      opacity: [0.3, 0.1, 0.3],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                {/* Item circle */}
                <motion.circle
                  cx={item.x}
                  cy={item.y}
                  r={itemSize}
                  fill={color}
                  opacity={item.salience}
                  animate={
                    isInBroadcast
                      ? { scale: [1, 1.2, 1], opacity: [item.salience, 1, item.salience] }
                      : {}
                  }
                  transition={{ duration: 0.5, repeat: isInBroadcast ? Infinity : 0 }}
                />

                {/* Type label */}
                <text
                  x={item.x}
                  y={item.y + itemSize + 12}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.6)"
                  fontSize={9}
                >
                  {item.type}
                </text>
              </motion.g>
            );
          })}
        </AnimatePresence>

        {/* Center label */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          alignmentBaseline="middle"
          fill="rgba(255,255,255,0.3)"
          fontSize={12}
        >
          GW
        </text>
      </svg>

      {/* Status labels */}
      <div
        style={{
          position: 'absolute',
          bottom: 5,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 16,
          fontSize: 10,
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        <span>
          Items: {items.length}/{capacity}
        </span>
        <span>Coalitions: {coalitions.length}</span>
        {broadcastActive && (
          <motion.span
            style={{ color: '#00ff88' }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            ● BROADCAST
          </motion.span>
        )}
      </div>
    </div>
  );
}
