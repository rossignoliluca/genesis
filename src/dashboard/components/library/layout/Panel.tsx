/**
 * Panel - Container component for dashboard sections
 */
import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode, useState } from 'react';

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  actions?: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'glass' | 'solid' | 'outline';
  status?: 'normal' | 'active' | 'warning' | 'error';
  fullHeight?: boolean;
}

const paddingStyles = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 24,
};

const variantStyles = {
  default: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  glass: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  solid: {
    background: 'rgba(20,20,30,0.9)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  outline: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
  },
};

const statusColors = {
  normal: 'transparent',
  active: '#00ff88',
  warning: '#ffaa00',
  error: '#ff4444',
};

export function Panel({
  title,
  subtitle,
  icon,
  children,
  collapsible = false,
  defaultCollapsed = false,
  actions,
  padding = 'md',
  variant = 'default',
  status = 'normal',
  fullHeight = false,
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const variantStyle = variantStyles[variant];

  return (
    <motion.div
      style={{
        ...variantStyle,
        borderRadius: 12,
        overflow: 'hidden',
        height: fullHeight ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        borderTopColor: statusColors[status],
        borderTopWidth: status !== 'normal' ? 2 : 1,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
            cursor: collapsible ? 'pointer' : 'default',
          }}
          onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {icon && (
              <span style={{ fontSize: 18, opacity: 0.8 }}>{icon}</span>
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                {title}
              </div>
              {subtitle && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {actions}
            {collapsible && (
              <motion.span
                style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}
                animate={{ rotate: collapsed ? 0 : 180 }}
              >
                ▼
              </motion.span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            style={{
              padding: paddingStyles[padding],
              flex: 1,
              overflow: 'auto',
            }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * PanelGrid - Grid layout for panels
 */
interface PanelGridProps {
  children: ReactNode;
  columns?: number | 'auto';
  gap?: number;
  minChildWidth?: number;
}

export function PanelGrid({
  children,
  columns = 'auto',
  gap = 16,
  minChildWidth = 300,
}: PanelGridProps) {
  const gridStyle = columns === 'auto'
    ? { gridTemplateColumns: `repeat(auto-fit, minmax(${minChildWidth}px, 1fr))` }
    : { gridTemplateColumns: `repeat(${columns}, 1fr)` };

  return (
    <div
      style={{
        display: 'grid',
        ...gridStyle,
        gap,
      }}
    >
      {children}
    </div>
  );
}

/**
 * SplitPane - Horizontal/vertical split layout
 */
interface SplitPaneProps {
  children: [ReactNode, ReactNode];
  direction?: 'horizontal' | 'vertical';
  split?: number; // percentage for first pane
  gap?: number;
}

export function SplitPane({
  children,
  direction = 'horizontal',
  split = 50,
  gap = 16,
}: SplitPaneProps) {
  const [first, second] = children;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction === 'horizontal' ? 'row' : 'column',
        gap,
        height: '100%',
      }}
    >
      <div style={{ flex: `0 0 ${split}%`, overflow: 'auto' }}>{first}</div>
      <div style={{ flex: 1, overflow: 'auto' }}>{second}</div>
    </div>
  );
}
