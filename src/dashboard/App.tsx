import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, Float, Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import { useGenesisStore } from './stores/genesisStore';
import { useSSEConnection } from './hooks/useSSEConnection';

// Component Library Imports
import {
  PhiGauge as PhiGaugeLib,
  FreeEnergyGauge,
  CircularGauge,
  TimeSeriesChart,
  RadarChart,
  SwarmVisualization,
  NeuromodBalanceViz,
  WorkspaceVisualization,
  PainBodyMap,
  NetworkGraph,
  Panel,
  PanelGrid,
  MetricCard,
  StatusCard,
  StatusIndicator,
  DataTable,
  EventLog,
} from './components/library';

// ============================================================================
// GENESIS - Full Interactive Web Interface
// ============================================================================

type View = 'overview' | 'consciousness' | 'neuromod' | 'ness' | 'chat' | 'agents' | 'tasks' | 'creator' | 'terminal' | 'analytics' | 'files' | 'memory' | 'settings' | 'workflow' | 'playground' | 'integrations' | 'marketplace' | 'mcp' | 'codemind' | 'evolution' | 'sandbox' | 'lessons' | 'history' | 'inference' | 'pain' | 'allostasis' | 'worldmodel' | 'daemon' | 'finance' | 'revenue' | 'content' | 'swarm' | 'healing' | 'grounding';

// Icons as simple components
const Icons = {
  overview: () => <span>◉</span>,
  consciousness: () => <span>◎</span>,
  neuromod: () => <span>◈</span>,
  ness: () => <span>◇</span>,
  chat: () => <span>◆</span>,
  agents: () => <span>⬡</span>,
  tasks: () => <span>◇</span>,
  creator: () => <span>✦</span>,
  terminal: () => <span>⌨</span>,
  analytics: () => <span>📈</span>,
  files: () => <span>📁</span>,
  memory: () => <span>⬢</span>,
  settings: () => <span>⚙</span>,
  send: () => <span>→</span>,
  play: () => <span>▶</span>,
  stop: () => <span>■</span>,
  plus: () => <span>+</span>,
  search: () => <span>⌕</span>,
  close: () => <span>×</span>,
  check: () => <span>✓</span>,
  clock: () => <span>◔</span>,
  doc: () => <span>📄</span>,
  slides: () => <span>📊</span>,
  image: () => <span>🖼️</span>,
  video: () => <span>🎬</span>,
  code: () => <span>💻</span>,
  command: () => <span>⌘</span>,
  folder: () => <span>📂</span>,
  file: () => <span>📄</span>,
  bell: () => <span>🔔</span>,
  workflow: () => <span>⛓</span>,
  playground: () => <span>⚗</span>,
  integrations: () => <span>🔌</span>,
  marketplace: () => <span>🛒</span>,
  node: () => <span>◯</span>,
  connect: () => <span>⟷</span>,
  api: () => <span>⚡</span>,
  download: () => <span>↓</span>,
  star: () => <span>★</span>,
  verified: () => <span>✓</span>,
  copy: () => <span>⎘</span>,
  run: () => <span>▶</span>,
  chart: () => <span>📊</span>,
  editor: () => <span>✏️</span>,
  docs: () => <span>📚</span>,
  webhook: () => <span>🪝</span>,
  history: () => <span>🕐</span>,
  bookmark: () => <span>🔖</span>,
  export: () => <span>📤</span>,
  schedule: () => <span>📅</span>,
  mic: () => <span>🎤</span>,
  globe: () => <span>🌐</span>,
  lock: () => <span>🔒</span>,
  user: () => <span>👤</span>,
  sparkle: () => <span>✨</span>,
  rocket: () => <span>🚀</span>,
  cpu: () => <span>🔲</span>,
  database: () => <span>🗄️</span>,
  split: () => <span>⊞</span>,
  space: () => <span>◐</span>,
  palette: () => <span>🎨</span>,
  wand: () => <span>🪄</span>,
  layers: () => <span>☰</span>,
  mcp: () => <span>🔗</span>,
  server: () => <span>🖥️</span>,
  tool: () => <span>🔧</span>,
  research: () => <span>📚</span>,
  web: () => <span>🌐</span>,
  browser: () => <span>🌍</span>,
  codemind: () => <span>◎</span>,
  evolution: () => <span>⟳</span>,
  sandbox: () => <span>🧪</span>,
  lessons: () => <span>🧠</span>,
  modhistory: () => <span>📜</span>,
  inference: () => <span>🎯</span>,
  pain: () => <span>⚡</span>,
  allostasis: () => <span>⚖</span>,
  worldmodel: () => <span>🌐</span>,
  daemon: () => <span>👻</span>,
  finance: () => <span>📈</span>,
  revenue: () => <span>💰</span>,
  content: () => <span>📝</span>,
  swarm: () => <span>🐝</span>,
  healing: () => <span>💊</span>,
  grounding: () => <span>✓</span>,
};

// ============================================================================
// SPACES SYSTEM (Arc-style workspaces)
// ============================================================================

interface Space {
  id: string;
  name: string;
  color: string;
  icon: string;
  tabs: View[];
  isActive: boolean;
}

const defaultSpaces: Space[] = [
  { id: 'work', name: 'Work', color: '#a855f7', icon: '💼', tabs: ['overview', 'agents', 'tasks'], isActive: true },
  { id: 'dev', name: 'Development', color: '#06b6d4', icon: '👨‍💻', tabs: ['terminal', 'files', 'playground'], isActive: false },
  { id: 'creative', name: 'Creative', color: '#f59e0b', icon: '🎨', tabs: ['creator', 'chat'], isActive: false },
  { id: 'analytics', name: 'Analytics', color: '#10b981', icon: '📊', tabs: ['analytics', 'memory'], isActive: false },
];

function SpaceSwitcher({ spaces, activeSpace, onSwitch, onAddSpace }: {
  spaces: Space[];
  activeSpace: string;
  onSwitch: (id: string) => void;
  onAddSpace: () => void;
}) {
  return (
    <div className="space-switcher">
      {spaces.map(space => (
        <motion.button
          key={space.id}
          className={`space-tab ${activeSpace === space.id ? 'active' : ''}`}
          style={{ '--space-color': space.color } as React.CSSProperties}
          onClick={() => onSwitch(space.id)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="space-icon">{space.icon}</span>
          <span className="space-name">{space.name}</span>
          {activeSpace === space.id && (
            <motion.div
              className="space-indicator"
              layoutId="spaceIndicator"
              style={{ background: space.color }}
            />
          )}
        </motion.button>
      ))}
      <button className="add-space" onClick={onAddSpace}>
        <Icons.plus />
      </button>
    </div>
  );
}

// ============================================================================
// SPLIT VIEW SYSTEM
// ============================================================================

interface SplitPanel {
  id: string;
  view: View;
  size: number;
}

function SplitViewManager({ panels, onClose, onResize }: {
  panels: SplitPanel[];
  onClose: (id: string) => void;
  onResize: (id: string, size: number) => void;
}) {
  if (panels.length <= 1) return null;

  return (
    <div className="split-view-container" style={{
      gridTemplateColumns: panels.map(p => `${p.size}fr`).join(' ')
    }}>
      {panels.map((panel, i) => (
        <React.Fragment key={panel.id}>
          <div className="split-panel">
            <div className="split-panel-header">
              <span className="panel-title">{panel.view}</span>
              <button className="panel-close" onClick={() => onClose(panel.id)}>×</button>
            </div>
            <div className="split-panel-content">
              {/* View content rendered here */}
            </div>
          </div>
          {i < panels.length - 1 && (
            <div className="split-resizer" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================================================
// 3D INTERACTIVE HERO ORB
// ============================================================================

function ConsciousnessOrb({ phi, state }: { phi: number; state: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((frameState) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = frameState.clock.elapsedTime * 0.2;
      meshRef.current.rotation.y = frameState.clock.elapsedTime * 0.3;

      // Pulse based on phi
      const scale = 1 + Math.sin(frameState.clock.elapsedTime * 2) * 0.05 * phi;
      meshRef.current.scale.setScalar(scale);
    }
  });

  const getColor = () => {
    if (state === 'focused') return '#a855f7';
    if (state === 'dreaming') return '#06b6d4';
    if (state === 'vigilant') return '#f59e0b';
    return '#8b5cf6';
  };

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <Sphere
        ref={meshRef}
        args={[1, 64, 64]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <MeshDistortMaterial
          color={getColor()}
          attach="material"
          distort={0.3 + phi * 0.2}
          speed={2}
          roughness={0.2}
          metalness={0.8}
          emissive={getColor()}
          emissiveIntensity={hovered ? 0.5 : 0.2}
        />
      </Sphere>
    </Float>
  );
}

function HeroOrb3D() {
  const { consciousness } = useGenesisStore();

  return (
    <div className="hero-orb-container">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} color="#06b6d4" intensity={0.5} />
        <Stars radius={100} depth={50} count={1000} factor={4} fade speed={1} />
        <ConsciousnessOrb phi={consciousness.phi} state={consciousness.state} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
      <div className="orb-overlay">
        <span className="orb-phi">φ = {consciousness.phi.toFixed(3)}</span>
        <span className="orb-state">{consciousness.state}</span>
      </div>
    </div>
  );
}

// ============================================================================
// LCH COLOR SYSTEM & THEME ENGINE
// ============================================================================

interface ThemeConfig {
  baseHue: number;
  accentHue: number;
  contrast: 'low' | 'medium' | 'high';
  mode: 'dark' | 'light';
}

const generateTheme = (config: ThemeConfig) => {
  const { baseHue, accentHue, contrast, mode } = config;

  const contrastMultiplier = contrast === 'high' ? 1.2 : contrast === 'low' ? 0.8 : 1;
  const isDark = mode === 'dark';

  return {
    '--theme-base': `lch(${isDark ? 10 : 95}% 5 ${baseHue})`,
    '--theme-surface': `lch(${isDark ? 15 : 100}% 3 ${baseHue})`,
    '--theme-elevated': `lch(${isDark ? 20 : 98}% 4 ${baseHue})`,
    '--theme-accent': `lch(60% 80 ${accentHue})`,
    '--theme-accent-dim': `lch(40% 60 ${accentHue})`,
    '--theme-text': `lch(${isDark ? 90 : 10}% 5 ${baseHue})`,
    '--theme-text-secondary': `lch(${isDark ? 70 : 40}% 5 ${baseHue})`,
    '--theme-text-muted': `lch(${isDark ? 50 : 60}% 5 ${baseHue})`,
    '--theme-border': `lch(${isDark ? 25 : 85}% 3 ${baseHue} / 0.5)`,
    '--contrast-multiplier': contrastMultiplier,
  };
};

function ThemeCustomizer({ isOpen, onClose, onApply }: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: ThemeConfig) => void;
}) {
  const [config, setConfig] = useState<ThemeConfig>({
    baseHue: 270,
    accentHue: 270,
    contrast: 'medium',
    mode: 'dark',
  });

  const presets = [
    { name: 'Genesis Purple', baseHue: 270, accentHue: 270 },
    { name: 'Ocean Blue', baseHue: 220, accentHue: 200 },
    { name: 'Forest Green', baseHue: 150, accentHue: 140 },
    { name: 'Sunset Orange', baseHue: 30, accentHue: 25 },
    { name: 'Rose Pink', baseHue: 340, accentHue: 330 },
    { name: 'Monochrome', baseHue: 0, accentHue: 0 },
  ];

  if (!isOpen) return null;

  return (
    <>
      <motion.div className="theme-overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        className="theme-customizer"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <div className="theme-header">
          <h2>🎨 Theme Studio</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="theme-content">
          <div className="theme-section">
            <h3>Presets</h3>
            <div className="theme-presets">
              {presets.map(preset => (
                <button
                  key={preset.name}
                  className="preset-btn"
                  style={{ '--preset-color': `lch(60% 80 ${preset.accentHue})` } as React.CSSProperties}
                  onClick={() => setConfig(c => ({ ...c, baseHue: preset.baseHue, accentHue: preset.accentHue }))}
                >
                  <span className="preset-swatch" />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="theme-section">
            <h3>Custom Colors</h3>
            <div className="theme-sliders">
              <div className="slider-group">
                <label>Base Hue: {config.baseHue}°</label>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={config.baseHue}
                  onChange={e => setConfig(c => ({ ...c, baseHue: parseInt(e.target.value) }))}
                  className="hue-slider"
                />
              </div>
              <div className="slider-group">
                <label>Accent Hue: {config.accentHue}°</label>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={config.accentHue}
                  onChange={e => setConfig(c => ({ ...c, accentHue: parseInt(e.target.value) }))}
                  className="hue-slider"
                />
              </div>
            </div>
          </div>

          <div className="theme-section">
            <h3>Contrast</h3>
            <div className="contrast-options">
              {(['low', 'medium', 'high'] as const).map(level => (
                <button
                  key={level}
                  className={`contrast-btn ${config.contrast === level ? 'active' : ''}`}
                  onClick={() => setConfig(c => ({ ...c, contrast: level }))}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="theme-section">
            <h3>Mode</h3>
            <div className="mode-toggle">
              <button
                className={config.mode === 'dark' ? 'active' : ''}
                onClick={() => setConfig(c => ({ ...c, mode: 'dark' }))}
              >
                🌙 Dark
              </button>
              <button
                className={config.mode === 'light' ? 'active' : ''}
                onClick={() => setConfig(c => ({ ...c, mode: 'light' }))}
              >
                ☀️ Light
              </button>
            </div>
          </div>

          <div className="theme-preview">
            <h3>Preview</h3>
            <div className="preview-card" style={generateTheme(config) as React.CSSProperties}>
              <div className="preview-header">Sample Card</div>
              <div className="preview-body">This is how your theme looks</div>
              <button className="preview-btn">Action</button>
            </div>
          </div>
        </div>

        <div className="theme-actions">
          <button className="apply-btn" onClick={() => onApply(config)}>
            Apply Theme
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ============================================================================
// AI AUTOFILL / SMART SUGGESTIONS
// ============================================================================

function AIAutofill({ context, onSelect }: {
  context: string;
  onSelect: (suggestion: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!context || context.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      // Simulate AI suggestions based on context
      const mockSuggestions = [
        `Complete: "${context}..."`,
        `Expand on: ${context}`,
        `Generate code for: ${context}`,
        `Search docs for: ${context}`,
      ];
      setSuggestions(mockSuggestions.slice(0, 3));
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [context]);

  if (!suggestions.length && !loading) return null;

  return (
    <motion.div
      className="ai-autofill"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="autofill-header">
        <span className="autofill-icon">✨</span>
        <span>AI Suggestions</span>
        {loading && <span className="autofill-loading" />}
      </div>
      <div className="autofill-list">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="autofill-item"
            onClick={() => onSelect(suggestion)}
          >
            <span className="suggestion-icon">→</span>
            <span className="suggestion-text">{suggestion}</span>
            <span className="suggestion-key">Tab</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// BOOSTS SYSTEM (Custom CSS/JS)
// ============================================================================

interface Boost {
  id: string;
  name: string;
  description: string;
  css?: string;
  enabled: boolean;
}

function BoostsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [boosts, setBoosts] = useState<Boost[]>([
    { id: '1', name: 'Neon Glow', description: 'Add neon glow effects to buttons', css: '.nav-item:hover { box-shadow: 0 0 20px var(--accent-purple); }', enabled: false },
    { id: '2', name: 'Rounded Everything', description: 'Extra rounded corners', css: '* { border-radius: 16px !important; }', enabled: false },
    { id: '3', name: 'Compact Mode', description: 'Reduce padding and spacing', css: '.view-container { padding: 12px !important; }', enabled: true },
    { id: '4', name: 'Rainbow Accent', description: 'Animated rainbow accent color', css: '@keyframes rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } } .logo-orb { animation: rainbow 5s linear infinite; }', enabled: false },
  ]);

  const [editingBoost, setEditingBoost] = useState<Boost | null>(null);

  const toggleBoost = (id: string) => {
    setBoosts(prev => prev.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b));
  };

  // Apply enabled boosts
  useEffect(() => {
    const styleId = 'genesis-boosts';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const enabledCSS = boosts.filter(b => b.enabled).map(b => b.css).join('\n');
    styleEl.textContent = enabledCSS;

    return () => {
      if (styleEl) styleEl.textContent = '';
    };
  }, [boosts]);

  if (!isOpen) return null;

  return (
    <>
      <motion.div className="boosts-overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        className="boosts-panel"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="boosts-header">
          <h2>⚡ Boosts</h2>
          <p>Customize your Genesis experience</p>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="boosts-list">
          {boosts.map(boost => (
            <div key={boost.id} className={`boost-item ${boost.enabled ? 'enabled' : ''}`}>
              <div className="boost-info">
                <h3>{boost.name}</h3>
                <p>{boost.description}</p>
              </div>
              <div className="boost-actions">
                <button className="edit-boost" onClick={() => setEditingBoost(boost)}>Edit</button>
                <label className="boost-toggle">
                  <input
                    type="checkbox"
                    checked={boost.enabled}
                    onChange={() => toggleBoost(boost.id)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button className="add-boost-btn">
          <Icons.plus /> Create New Boost
        </button>

        {editingBoost && (
          <div className="boost-editor">
            <h3>Edit: {editingBoost.name}</h3>
            <textarea
              value={editingBoost.css}
              onChange={e => setEditingBoost({ ...editingBoost, css: e.target.value })}
              placeholder="/* Your CSS here */"
            />
            <div className="editor-actions">
              <button onClick={() => {
                setBoosts(prev => prev.map(b => b.id === editingBoost.id ? editingBoost : b));
                setEditingBoost(null);
              }}>Save</button>
              <button onClick={() => setEditingBoost(null)}>Cancel</button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}

// ============================================================================
// ENHANCED OVERVIEW WITH 3D
// ============================================================================

function EnhancedOverview() {
  const {
    connected,
    consciousness,
    neuromod,
    kernel,
    economy,
    memory,
    agents,
    events,
  } = useGenesisStore();

  return (
    <div className="enhanced-overview">
      {/* 3D Hero Section */}
      <div className="overview-hero">
        <HeroOrb3D />
        <div className="hero-stats">
          <motion.div
            className="hero-stat"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <span className="stat-value">{agents.active}</span>
            <span className="stat-label">Active Agents</span>
          </motion.div>
          <motion.div
            className="hero-stat"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="stat-value">{(consciousness.phi * 100).toFixed(0)}%</span>
            <span className="stat-label">Consciousness</span>
          </motion.div>
          <motion.div
            className="hero-stat"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <span className="stat-value">${economy.costs.toFixed(2)}</span>
            <span className="stat-label">Session Cost</span>
          </motion.div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-action-bar">
        <motion.button
          className="quick-action"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="qa-icon">💬</span>
          <span>Chat with Genesis</span>
        </motion.button>
        <motion.button
          className="quick-action"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="qa-icon">🤖</span>
          <span>Start Agent</span>
        </motion.button>
        <motion.button
          className="quick-action"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="qa-icon">⛓</span>
          <span>New Workflow</span>
        </motion.button>
        <motion.button
          className="quick-action"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="qa-icon">✨</span>
          <span>Generate Content</span>
        </motion.button>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <motion.div
          className="metric-card neuro"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3>Neuromodulation</h3>
          <div className="neuro-bars">
            {Object.entries(neuromod).map(([key, value]) => (
              <div key={key} className="neuro-bar">
                <span className="neuro-label">{key}</span>
                <div className="neuro-track">
                  <motion.div
                    className="neuro-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${value * 100}%` }}
                    transition={{ duration: 0.5 }}
                    style={{ background: key === 'dopamine' ? '#10b981' : key === 'serotonin' ? '#3b82f6' : key === 'norepinephrine' ? '#f59e0b' : '#ef4444' }}
                  />
                </div>
                <span className="neuro-value">{(value * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="metric-card kernel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3>Kernel Levels</h3>
          <div className="kernel-grid">
            {Object.entries(kernel.levels).map(([level, data]) => (
              <div key={level} className={`kernel-level ${data.active ? 'active' : ''}`}>
                <span className="level-name">{level.toUpperCase()}</span>
                <div className="level-ring">
                  <svg viewBox="0 0 36 36">
                    <path
                      className="ring-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <motion.path
                      className="ring-progress"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      initial={{ strokeDasharray: '0, 100' }}
                      animate={{ strokeDasharray: `${data.load * 100}, 100` }}
                    />
                  </svg>
                  <span className="level-percent">{(data.load * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="metric-card events"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3>Live Events</h3>
          <div className="events-stream">
            {events.slice(0, 5).map((event, i) => (
              <motion.div
                key={event.id}
                className="event-item"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <span className="event-dot" />
                <span className="event-type">{event.type}</span>
                <span className="event-time">
                  {new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </motion.div>
            ))}
            {events.length === 0 && (
              <div className="no-events">Waiting for events...</div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================================
// CHAT INTERFACE
// ============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agent?: string;
}

function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'system',
      content: 'Genesis è online. Come posso aiutarti?',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate response (replace with actual API call)
    setTimeout(() => {
      const response: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Ho ricevuto il tuo messaggio: "${userMessage.content}". Questa è una demo - collega l'API di Genesis per risposte reali.`,
        timestamp: Date.now(),
        agent: 'genesis',
      };
      setMessages(prev => [...prev, response]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>Chat con Genesis</h2>
        <span className="chat-status online">● Online</span>
      </div>

      <div className="chat-messages">
        {messages.map(msg => (
          <motion.div
            key={msg.id}
            className={`chat-message ${msg.role}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {msg.agent && <span className="message-agent">{msg.agent}</span>}
            <div className="message-content">{msg.content}</div>
            <span className="message-time">
              {new Date(msg.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </motion.div>
        ))}
        {isTyping && (
          <div className="chat-message assistant typing">
            <div className="typing-indicator">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio..."
          rows={1}
        />
        <button onClick={sendMessage} disabled={!input.trim()}>
          <Icons.send />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// AGENTS VIEW
// ============================================================================

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'running' | 'error';
  currentTask?: string;
  icon: string;
}

function AgentsView() {
  const { agents: agentState } = useGenesisStore();

  const [agents, setAgents] = useState<Agent[]>([
    { id: '1', name: 'Explorer', type: 'research', status: 'idle', icon: '◈' },
    { id: '2', name: 'Writer', type: 'content', status: 'running', currentTask: 'Scrivendo documentazione...', icon: '✎' },
    { id: '3', name: 'Analyst', type: 'analysis', status: 'idle', icon: '◉' },
    { id: '4', name: 'Coder', type: 'development', status: 'running', currentTask: 'Refactoring modulo auth...', icon: '⌘' },
    { id: '5', name: 'Planner', type: 'planning', status: 'idle', icon: '◇' },
    { id: '6', name: 'Critic', type: 'review', status: 'idle', icon: '◎' },
    { id: '7', name: 'Memory', type: 'storage', status: 'running', currentTask: 'Consolidando memorie...', icon: '⬡' },
    { id: '8', name: 'Executor', type: 'execution', status: 'idle', icon: '⚡' },
    { id: '9', name: 'Monitor', type: 'monitoring', status: 'running', currentTask: 'Monitorando sistema...', icon: '◐' },
    { id: '10', name: 'Dreamer', type: 'creative', status: 'idle', icon: '☽' },
  ]);

  const toggleAgent = (id: string) => {
    setAgents(prev => prev.map(a =>
      a.id === id
        ? { ...a, status: a.status === 'running' ? 'idle' : 'running' }
        : a
    ));
  };

  return (
    <div className="agents-view">
      <div className="view-header">
        <h2>Agenti</h2>
        <div className="header-stats">
          <span className="stat">{agents.filter(a => a.status === 'running').length} attivi</span>
          <span className="stat">{agents.length} totali</span>
        </div>
      </div>

      <div className="agents-grid">
        {agents.map(agent => (
          <motion.div
            key={agent.id}
            className={`agent-card ${agent.status}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="agent-header">
              <span className="agent-icon">{agent.icon}</span>
              <div className="agent-info">
                <h3>{agent.name}</h3>
                <span className="agent-type">{agent.type}</span>
              </div>
              <div className={`status-badge ${agent.status}`}>
                {agent.status === 'running' ? 'Attivo' : agent.status === 'error' ? 'Errore' : 'Inattivo'}
              </div>
            </div>

            {agent.currentTask && (
              <div className="agent-task">
                <span className="task-label">Task corrente:</span>
                <span className="task-text">{agent.currentTask}</span>
              </div>
            )}

            <div className="agent-actions">
              <button
                className={agent.status === 'running' ? 'stop' : 'start'}
                onClick={() => toggleAgent(agent.id)}
              >
                {agent.status === 'running' ? <><Icons.stop /> Stop</> : <><Icons.play /> Start</>}
              </button>
              <button className="secondary">Configura</button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TASKS VIEW
// ============================================================================

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAgent?: string;
  createdAt: number;
  reward?: number;
}

function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Analizza repository GitHub',
      description: 'Esplora la struttura del codice e genera documentazione',
      status: 'in_progress',
      priority: 'high',
      assignedAgent: 'Explorer',
      createdAt: Date.now() - 3600000,
      reward: 0.05,
    },
    {
      id: '2',
      title: 'Scrivi test unitari',
      description: 'Crea test per il modulo di autenticazione',
      status: 'pending',
      priority: 'medium',
      createdAt: Date.now() - 7200000,
      reward: 0.03,
    },
    {
      id: '3',
      title: 'Ottimizza query database',
      description: 'Migliora le performance delle query SQL lente',
      status: 'completed',
      priority: 'critical',
      assignedAgent: 'Coder',
      createdAt: Date.now() - 86400000,
      reward: 0.10,
    },
  ]);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' as Task['priority'] });

  const createTask = () => {
    if (!newTask.title.trim()) return;

    const task: Task = {
      id: crypto.randomUUID(),
      title: newTask.title,
      description: newTask.description,
      status: 'pending',
      priority: newTask.priority,
      createdAt: Date.now(),
    };

    setTasks(prev => [task, ...prev]);
    setNewTask({ title: '', description: '', priority: 'medium' });
    setShowNewTask(false);
  };

  const statusColors = {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    completed: '#10b981',
    failed: '#ef4444',
  };

  const priorityColors = {
    low: '#71717a',
    medium: '#f59e0b',
    high: '#f97316',
    critical: '#ef4444',
  };

  return (
    <div className="tasks-view">
      <div className="view-header">
        <h2>Task & Bounty</h2>
        <button className="primary-btn" onClick={() => setShowNewTask(true)}>
          <Icons.plus /> Nuovo Task
        </button>
      </div>

      <AnimatePresence>
        {showNewTask && (
          <motion.div
            className="new-task-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <input
              type="text"
              placeholder="Titolo del task..."
              value={newTask.title}
              onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
            />
            <textarea
              placeholder="Descrizione..."
              value={newTask.description}
              onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
            />
            <div className="form-row">
              <select
                value={newTask.priority}
                onChange={e => setNewTask(prev => ({ ...prev, priority: e.target.value as Task['priority'] }))}
              >
                <option value="low">Bassa priorità</option>
                <option value="medium">Media priorità</option>
                <option value="high">Alta priorità</option>
                <option value="critical">Critica</option>
              </select>
              <div className="form-actions">
                <button onClick={() => setShowNewTask(false)}>Annulla</button>
                <button className="primary" onClick={createTask}>Crea Task</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="tasks-list">
        {tasks.map(task => (
          <motion.div
            key={task.id}
            className={`task-card ${task.status}`}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="task-priority" style={{ background: priorityColors[task.priority] }} />

            <div className="task-content">
              <div className="task-header">
                <h3>{task.title}</h3>
                <div className="task-status" style={{ color: statusColors[task.status] }}>
                  {task.status === 'pending' && 'In attesa'}
                  {task.status === 'in_progress' && 'In corso'}
                  {task.status === 'completed' && 'Completato'}
                  {task.status === 'failed' && 'Fallito'}
                </div>
              </div>

              <p className="task-description">{task.description}</p>

              <div className="task-meta">
                {task.assignedAgent && (
                  <span className="task-agent">⬡ {task.assignedAgent}</span>
                )}
                {task.reward && (
                  <span className="task-reward">${task.reward.toFixed(2)}</span>
                )}
                <span className="task-time">
                  <Icons.clock /> {new Date(task.createdAt).toLocaleDateString('it-IT')}
                </span>
              </div>
            </div>

            <div className="task-actions">
              {task.status === 'pending' && (
                <button className="assign-btn">Assegna</button>
              )}
              {task.status === 'in_progress' && (
                <button className="view-btn">Dettagli</button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MEMORY VIEW
// ============================================================================

interface Memory {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  content: string;
  timestamp: number;
  tags: string[];
  relevance: number;
}

function MemoryView() {
  const { memory: memoryState } = useGenesisStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | Memory['type']>('all');

  const [memories, setMemories] = useState<Memory[]>([
    {
      id: '1',
      type: 'episodic',
      content: 'Conversazione con utente riguardo architettura del sistema Genesis',
      timestamp: Date.now() - 3600000,
      tags: ['architettura', 'genesis', 'design'],
      relevance: 0.95,
    },
    {
      id: '2',
      type: 'semantic',
      content: 'React Three Fiber è una libreria per creare scene 3D in React usando Three.js',
      timestamp: Date.now() - 86400000,
      tags: ['react', 'three.js', 'r3f', '3d'],
      relevance: 0.82,
    },
    {
      id: '3',
      type: 'procedural',
      content: 'Procedura per deploy: 1) npm run build 2) test 3) push to main 4) deploy',
      timestamp: Date.now() - 172800000,
      tags: ['deploy', 'ci-cd', 'procedura'],
      relevance: 0.78,
    },
    {
      id: '4',
      type: 'episodic',
      content: 'Debug del modulo SSE connection - risolto problema di reconnection',
      timestamp: Date.now() - 7200000,
      tags: ['debug', 'sse', 'networking'],
      relevance: 0.88,
    },
    {
      id: '5',
      type: 'semantic',
      content: 'Zustand è un state manager leggero per React con API semplice',
      timestamp: Date.now() - 259200000,
      tags: ['zustand', 'react', 'state'],
      relevance: 0.75,
    },
  ]);

  const typeColors = {
    episodic: '#f59e0b',
    semantic: '#3b82f6',
    procedural: '#10b981',
  };

  const typeLabels = {
    episodic: 'Episodica',
    semantic: 'Semantica',
    procedural: 'Procedurale',
  };

  const filteredMemories = memories.filter(m => {
    const matchesType = selectedType === 'all' || m.type === selectedType;
    const matchesSearch = !searchQuery ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  return (
    <div className="memory-view">
      <div className="view-header">
        <h2>Memory Explorer</h2>
        <div className="memory-stats">
          <span className="stat episodic">{memoryState.episodic} episodiche</span>
          <span className="stat semantic">{memoryState.semantic} semantiche</span>
          <span className="stat procedural">{memoryState.procedural} procedurali</span>
        </div>
      </div>

      <div className="memory-filters">
        <div className="search-box">
          <Icons.search />
          <input
            type="text"
            placeholder="Cerca nelle memorie..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="type-filters">
          <button
            className={selectedType === 'all' ? 'active' : ''}
            onClick={() => setSelectedType('all')}
          >
            Tutte
          </button>
          <button
            className={selectedType === 'episodic' ? 'active' : ''}
            onClick={() => setSelectedType('episodic')}
            style={{ '--accent': typeColors.episodic } as React.CSSProperties}
          >
            Episodiche
          </button>
          <button
            className={selectedType === 'semantic' ? 'active' : ''}
            onClick={() => setSelectedType('semantic')}
            style={{ '--accent': typeColors.semantic } as React.CSSProperties}
          >
            Semantiche
          </button>
          <button
            className={selectedType === 'procedural' ? 'active' : ''}
            onClick={() => setSelectedType('procedural')}
            style={{ '--accent': typeColors.procedural } as React.CSSProperties}
          >
            Procedurali
          </button>
        </div>
      </div>

      <div className="memory-list">
        {filteredMemories.map(memory => (
          <motion.div
            key={memory.id}
            className="memory-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            layout
          >
            <div className="memory-type-badge" style={{ background: typeColors[memory.type] }}>
              {typeLabels[memory.type]}
            </div>
            <div className="memory-content">{memory.content}</div>
            <div className="memory-meta">
              <div className="memory-tags">
                {memory.tags.map(tag => (
                  <span key={tag} className="tag">#{tag}</span>
                ))}
              </div>
              <div className="memory-info">
                <span className="relevance">{(memory.relevance * 100).toFixed(0)}% rilevanza</span>
                <span className="time">{new Date(memory.timestamp).toLocaleDateString('it-IT')}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CREATOR VIEW - Presentations, Documents, Content
// ============================================================================

interface Creation {
  id: string;
  type: 'presentation' | 'document' | 'image' | 'code' | 'video';
  title: string;
  description: string;
  status: 'draft' | 'generating' | 'completed' | 'error';
  createdAt: number;
  progress?: number;
}

function CreatorView() {
  const [creations, setCreations] = useState<Creation[]>([
    {
      id: '1',
      type: 'presentation',
      title: 'Genesis Architecture Overview',
      description: 'Presentazione sulla architettura del sistema Genesis con diagrammi',
      status: 'completed',
      createdAt: Date.now() - 86400000,
    },
    {
      id: '2',
      type: 'document',
      title: 'API Documentation',
      description: 'Documentazione completa delle API REST e WebSocket',
      status: 'generating',
      progress: 65,
      createdAt: Date.now() - 3600000,
    },
    {
      id: '3',
      type: 'code',
      title: 'MCP Server Template',
      description: 'Template TypeScript per creare nuovi MCP servers',
      status: 'completed',
      createdAt: Date.now() - 172800000,
    },
  ]);

  const [showNewCreation, setShowNewCreation] = useState(false);
  const [newCreation, setNewCreation] = useState({
    type: 'presentation' as Creation['type'],
    title: '',
    description: '',
  });
  const [prompt, setPrompt] = useState('');

  const createContent = () => {
    if (!newCreation.title.trim()) return;

    const creation: Creation = {
      id: crypto.randomUUID(),
      type: newCreation.type,
      title: newCreation.title,
      description: newCreation.description || prompt,
      status: 'generating',
      progress: 0,
      createdAt: Date.now(),
    };

    setCreations(prev => [creation, ...prev]);
    setNewCreation({ type: 'presentation', title: '', description: '' });
    setPrompt('');
    setShowNewCreation(false);

    // Simulate generation progress
    const interval = setInterval(() => {
      setCreations(prev => prev.map(c => {
        if (c.id === creation.id && c.status === 'generating') {
          const newProgress = (c.progress || 0) + Math.random() * 15;
          if (newProgress >= 100) {
            clearInterval(interval);
            return { ...c, status: 'completed', progress: 100 };
          }
          return { ...c, progress: newProgress };
        }
        return c;
      }));
    }, 500);
  };

  const typeIcons = {
    presentation: '📊',
    document: '📄',
    image: '🖼️',
    code: '💻',
    video: '🎬',
  };

  const typeLabels = {
    presentation: 'Presentazione',
    document: 'Documento',
    image: 'Immagine',
    code: 'Codice',
    video: 'Video',
  };

  const statusLabels = {
    draft: 'Bozza',
    generating: 'In creazione...',
    completed: 'Completato',
    error: 'Errore',
  };

  return (
    <div className="creator-view">
      <div className="view-header">
        <h2>Creator Studio</h2>
        <button className="primary-btn" onClick={() => setShowNewCreation(true)}>
          <Icons.plus /> Nuovo Contenuto
        </button>
      </div>

      <AnimatePresence>
        {showNewCreation && (
          <motion.div
            className="new-creation-modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="modal-header">
              <h3>Crea Nuovo Contenuto</h3>
              <button className="close-btn" onClick={() => setShowNewCreation(false)}>
                <Icons.close />
              </button>
            </div>

            <div className="creation-types">
              {(Object.keys(typeIcons) as Creation['type'][]).map(type => (
                <button
                  key={type}
                  className={`type-option ${newCreation.type === type ? 'selected' : ''}`}
                  onClick={() => setNewCreation(prev => ({ ...prev, type }))}
                >
                  <span className="type-icon">{typeIcons[type]}</span>
                  <span className="type-label">{typeLabels[type]}</span>
                </button>
              ))}
            </div>

            <div className="creation-form">
              <input
                type="text"
                placeholder="Titolo del contenuto..."
                value={newCreation.title}
                onChange={e => setNewCreation(prev => ({ ...prev, title: e.target.value }))}
              />
              <textarea
                placeholder="Descrivi cosa vuoi creare... (es. 'Una presentazione di 10 slide sulla architettura microservizi con esempi di codice')"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
              />
              <div className="form-actions">
                <button onClick={() => setShowNewCreation(false)}>Annulla</button>
                <button className="primary" onClick={createContent}>
                  ✦ Genera con AI
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showNewCreation && <div className="modal-backdrop" onClick={() => setShowNewCreation(false)} />}

      <div className="creation-templates">
        <h3>Template Rapidi</h3>
        <div className="templates-grid">
          <button className="template-card" onClick={() => {
            setNewCreation({ type: 'presentation', title: '', description: '' });
            setPrompt('Crea una presentazione professionale');
            setShowNewCreation(true);
          }}>
            <span className="template-icon">📊</span>
            <span className="template-name">Pitch Deck</span>
            <span className="template-desc">Presentazione per investitori</span>
          </button>
          <button className="template-card" onClick={() => {
            setNewCreation({ type: 'document', title: '', description: '' });
            setPrompt('Genera documentazione tecnica');
            setShowNewCreation(true);
          }}>
            <span className="template-icon">📄</span>
            <span className="template-name">Tech Docs</span>
            <span className="template-desc">Documentazione API/SDK</span>
          </button>
          <button className="template-card" onClick={() => {
            setNewCreation({ type: 'presentation', title: '', description: '' });
            setPrompt('Crea una presentazione educativa');
            setShowNewCreation(true);
          }}>
            <span className="template-icon">🎓</span>
            <span className="template-name">Tutorial</span>
            <span className="template-desc">Corso o lezione</span>
          </button>
          <button className="template-card" onClick={() => {
            setNewCreation({ type: 'code', title: '', description: '' });
            setPrompt('Genera codice boilerplate');
            setShowNewCreation(true);
          }}>
            <span className="template-icon">🚀</span>
            <span className="template-name">Starter Kit</span>
            <span className="template-desc">Progetto base</span>
          </button>
        </div>
      </div>

      <div className="creations-section">
        <h3>I Tuoi Contenuti</h3>
        <div className="creations-list">
          {creations.map(creation => (
            <motion.div
              key={creation.id}
              className={`creation-card ${creation.status}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="creation-icon">{typeIcons[creation.type]}</div>
              <div className="creation-content">
                <div className="creation-header">
                  <h4>{creation.title}</h4>
                  <span className={`creation-status ${creation.status}`}>
                    {statusLabels[creation.status]}
                  </span>
                </div>
                <p className="creation-desc">{creation.description}</p>
                {creation.status === 'generating' && creation.progress !== undefined && (
                  <div className="creation-progress">
                    <div className="progress-bar">
                      <motion.div
                        className="progress-fill"
                        animate={{ width: `${creation.progress}%` }}
                      />
                    </div>
                    <span className="progress-text">{Math.round(creation.progress)}%</span>
                  </div>
                )}
                <div className="creation-meta">
                  <span className="creation-type">{typeLabels[creation.type]}</span>
                  <span className="creation-date">
                    {new Date(creation.createdAt).toLocaleDateString('it-IT')}
                  </span>
                </div>
              </div>
              <div className="creation-actions">
                {creation.status === 'completed' && (
                  <>
                    <button className="action-btn">Apri</button>
                    <button className="action-btn">Esporta</button>
                  </>
                )}
                {creation.status === 'generating' && (
                  <button className="action-btn cancel">Annulla</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TERMINAL VIEW - Live Genesis Logs
// ============================================================================

function TerminalView() {
  const [logs, setLogs] = useState<Array<{ id: string; timestamp: number; level: string; message: string; source: string }>>([
    { id: '1', timestamp: Date.now() - 5000, level: 'info', message: 'Genesis kernel initialized', source: 'kernel' },
    { id: '2', timestamp: Date.now() - 4500, level: 'info', message: 'Loading consciousness module...', source: 'consciousness' },
    { id: '3', timestamp: Date.now() - 4000, level: 'success', message: 'φ computation ready (IIT 4.0)', source: 'consciousness' },
    { id: '4', timestamp: Date.now() - 3500, level: 'info', message: 'Connecting to MCP servers...', source: 'mcp' },
    { id: '5', timestamp: Date.now() - 3000, level: 'success', message: 'Connected: filesystem, github, slack', source: 'mcp' },
    { id: '6', timestamp: Date.now() - 2500, level: 'info', message: 'Initializing agent pool (10 agents)', source: 'agents' },
    { id: '7', timestamp: Date.now() - 2000, level: 'success', message: 'All agents ready', source: 'agents' },
    { id: '8', timestamp: Date.now() - 1500, level: 'info', message: 'Starting neuromodulation system...', source: 'neuromod' },
    { id: '9', timestamp: Date.now() - 1000, level: 'success', message: 'System fully operational', source: 'kernel' },
    { id: '10', timestamp: Date.now() - 500, level: 'debug', message: 'Heartbeat: φ=0.847, energy=1.23 nats', source: 'kernel' },
  ]);

  const [command, setCommand] = useState('');
  const [filter, setFilter] = useState<'all' | 'info' | 'success' | 'warn' | 'error' | 'debug'>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Simulate new logs
  useEffect(() => {
    const messages = [
      { level: 'debug', message: 'Memory consolidation cycle complete', source: 'memory' },
      { level: 'info', message: 'Agent Explorer started task: code-analysis', source: 'agents' },
      { level: 'debug', message: 'Heartbeat: φ=0.852, energy=1.19 nats', source: 'kernel' },
      { level: 'info', message: 'SSE client connected', source: 'dashboard' },
      { level: 'success', message: 'Task completed: documentation-update', source: 'agents' },
      { level: 'warn', message: 'High latency detected on anthropic provider (2.3s)', source: 'llm' },
      { level: 'info', message: 'Neuromodulation adjustment: DA +0.05', source: 'neuromod' },
    ];

    const interval = setInterval(() => {
      const msg = messages[Math.floor(Math.random() * messages.length)];
      setLogs(prev => [...prev.slice(-100), {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...msg,
      }]);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const executeCommand = () => {
    if (!command.trim()) return;
    setLogs(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level: 'command',
      message: `$ ${command}`,
      source: 'user',
    }]);

    // Simulate response
    setTimeout(() => {
      setLogs(prev => [...prev, {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        level: 'info',
        message: `Command "${command}" executed`,
        source: 'system',
      }]);
    }, 500);

    setCommand('');
  };

  const levelColors: Record<string, string> = {
    info: '#3b82f6',
    success: '#10b981',
    warn: '#f59e0b',
    error: '#ef4444',
    debug: '#71717a',
    command: '#a855f7',
  };

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  return (
    <div className="terminal-view">
      <div className="view-header">
        <h2>Terminal</h2>
        <div className="terminal-filters">
          {['all', 'info', 'success', 'warn', 'error', 'debug'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f as typeof filter)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="terminal-output">
        {filteredLogs.map(log => (
          <div key={log.id} className={`log-line ${log.level}`}>
            <span className="log-time">
              {new Date(log.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="log-source">[{log.source}]</span>
            <span className="log-level" style={{ color: levelColors[log.level] }}>
              {log.level.toUpperCase()}
            </span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div className="terminal-input">
        <span className="terminal-prompt">genesis $</span>
        <input
          type="text"
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && executeCommand()}
          placeholder="Enter command..."
        />
      </div>
    </div>
  );
}

// ============================================================================
// ANALYTICS VIEW - Costs and Usage
// ============================================================================

function AnalyticsView() {
  const { economy } = useGenesisStore();

  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  // Mock data for charts
  const costData = [
    { day: 'Lun', cost: 0.12, requests: 45 },
    { day: 'Mar', cost: 0.08, requests: 32 },
    { day: 'Mer', cost: 0.15, requests: 58 },
    { day: 'Gio', cost: 0.22, requests: 87 },
    { day: 'Ven', cost: 0.18, requests: 72 },
    { day: 'Sab', cost: 0.05, requests: 18 },
    { day: 'Dom', cost: 0.03, requests: 12 },
  ];

  const providerData = [
    { name: 'Anthropic', cost: 0.45, percentage: 55, color: '#a855f7' },
    { name: 'OpenAI', cost: 0.28, percentage: 34, color: '#10b981' },
    { name: 'Google', cost: 0.09, percentage: 11, color: '#3b82f6' },
  ];

  const maxCost = Math.max(...costData.map(d => d.cost));

  return (
    <div className="analytics-view">
      <div className="view-header">
        <h2>Analytics</h2>
        <div className="time-range-selector">
          {['24h', '7d', '30d'].map(range => (
            <button
              key={range}
              className={`range-btn ${timeRange === range ? 'active' : ''}`}
              onClick={() => setTimeRange(range as typeof timeRange)}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-grid">
        {/* Summary Cards */}
        <div className="analytics-card summary">
          <h3>Costi Totali</h3>
          <div className="big-number">${(economy.totalCosts || 0.83).toFixed(2)}</div>
          <div className="comparison up">+12% vs periodo precedente</div>
        </div>

        <div className="analytics-card summary">
          <h3>Richieste LLM</h3>
          <div className="big-number">324</div>
          <div className="comparison down">-5% vs periodo precedente</div>
        </div>

        <div className="analytics-card summary">
          <h3>Costo Medio/Richiesta</h3>
          <div className="big-number">$0.0026</div>
          <div className="comparison stable">= periodo precedente</div>
        </div>

        <div className="analytics-card summary">
          <h3>Token Utilizzati</h3>
          <div className="big-number">1.2M</div>
          <div className="comparison up">+8% vs periodo precedente</div>
        </div>

        {/* Cost Chart */}
        <div className="analytics-card chart-card">
          <h3>Costi Giornalieri</h3>
          <div className="bar-chart">
            {costData.map((d, i) => (
              <div key={i} className="bar-column">
                <div className="bar-wrapper">
                  <motion.div
                    className="bar"
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.cost / maxCost) * 100}%` }}
                    transition={{ delay: i * 0.1 }}
                  />
                </div>
                <span className="bar-label">{d.day}</span>
                <span className="bar-value">${d.cost}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Provider Breakdown */}
        <div className="analytics-card provider-card">
          <h3>Per Provider</h3>
          <div className="provider-list">
            {providerData.map(p => (
              <div key={p.name} className="provider-row">
                <div className="provider-info">
                  <span className="provider-name">{p.name}</span>
                  <span className="provider-cost">${p.cost.toFixed(2)}</span>
                </div>
                <div className="provider-bar">
                  <motion.div
                    className="provider-fill"
                    style={{ background: p.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${p.percentage}%` }}
                  />
                </div>
                <span className="provider-percentage">{p.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Usage */}
        <div className="analytics-card">
          <h3>Utilizzo Agenti</h3>
          <div className="agent-usage-list">
            {[
              { name: 'Coder', usage: 85, tasks: 42 },
              { name: 'Explorer', usage: 72, tasks: 38 },
              { name: 'Writer', usage: 65, tasks: 29 },
              { name: 'Analyst', usage: 45, tasks: 18 },
              { name: 'Planner', usage: 30, tasks: 12 },
            ].map(agent => (
              <div key={agent.name} className="agent-usage-row">
                <span className="agent-usage-name">{agent.name}</span>
                <div className="agent-usage-bar">
                  <motion.div
                    className="agent-usage-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${agent.usage}%` }}
                  />
                </div>
                <span className="agent-usage-tasks">{agent.tasks} tasks</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FILES VIEW - Project File Explorer
// ============================================================================

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  size?: string;
  modified?: string;
}

function FilesView() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src/dashboard']));

  const fileTree: FileNode[] = [
    {
      name: 'src',
      type: 'folder',
      children: [
        {
          name: 'dashboard',
          type: 'folder',
          children: [
            { name: 'App.tsx', type: 'file', size: '45KB', modified: 'now' },
            { name: 'main.tsx', type: 'file', size: '1KB', modified: '2h ago' },
            { name: 'index.html', type: 'file', size: '0.5KB', modified: '1d ago' },
          ],
        },
        {
          name: 'kernel',
          type: 'folder',
          children: [
            { name: 'consciousness.ts', type: 'file', size: '12KB', modified: '3h ago' },
            { name: 'neuromod.ts', type: 'file', size: '8KB', modified: '1d ago' },
            { name: 'active-inference.ts', type: 'file', size: '15KB', modified: '2d ago' },
          ],
        },
        {
          name: 'agents',
          type: 'folder',
          children: [
            { name: 'agent-pool.ts', type: 'file', size: '10KB', modified: '5h ago' },
            { name: 'executor.ts', type: 'file', size: '6KB', modified: '1d ago' },
          ],
        },
        { name: 'index.ts', type: 'file', size: '2KB', modified: '1d ago' },
      ],
    },
    {
      name: 'package.json',
      type: 'file',
      size: '1.5KB',
      modified: '3d ago',
    },
    {
      name: 'tsconfig.json',
      type: 'file',
      size: '0.8KB',
      modified: '1w ago',
    },
  ];

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderTree = (nodes: FileNode[], path = ''): React.ReactNode => {
    return nodes.map(node => {
      const nodePath = path ? `${path}/${node.name}` : node.name;
      const isExpanded = expandedFolders.has(nodePath);
      const isSelected = selectedFile === nodePath;

      if (node.type === 'folder') {
        return (
          <div key={nodePath} className="file-node folder">
            <div
              className={`file-row ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleFolder(nodePath)}
            >
              <span className="file-icon">{isExpanded ? '📂' : '📁'}</span>
              <span className="file-name">{node.name}</span>
              <span className="folder-arrow">{isExpanded ? '▼' : '▶'}</span>
            </div>
            {isExpanded && node.children && (
              <div className="folder-children">
                {renderTree(node.children, nodePath)}
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          key={nodePath}
          className={`file-node file ${isSelected ? 'selected' : ''}`}
          onClick={() => setSelectedFile(nodePath)}
        >
          <div className="file-row">
            <span className="file-icon">
              {node.name.endsWith('.ts') || node.name.endsWith('.tsx') ? '📜' :
               node.name.endsWith('.json') ? '📋' :
               node.name.endsWith('.html') ? '🌐' : '📄'}
            </span>
            <span className="file-name">{node.name}</span>
            <span className="file-size">{node.size}</span>
            <span className="file-modified">{node.modified}</span>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="files-view">
      <div className="view-header">
        <h2>File Explorer</h2>
        <div className="file-actions">
          <button className="file-action-btn">
            <Icons.plus /> New File
          </button>
          <button className="file-action-btn">
            <Icons.folder /> New Folder
          </button>
        </div>
      </div>

      <div className="files-layout">
        <div className="file-tree">
          <div className="tree-header">
            <span>GENESIS PROJECT</span>
          </div>
          <div className="tree-content">
            {renderTree(fileTree)}
          </div>
        </div>

        <div className="file-preview">
          {selectedFile ? (
            <>
              <div className="preview-header">
                <span className="preview-path">{selectedFile}</span>
                <div className="preview-actions">
                  <button>Edit</button>
                  <button>Delete</button>
                </div>
              </div>
              <div className="preview-content">
                <pre className="code-preview">
{`// ${selectedFile}
// Preview content would appear here

import { Genesis } from './genesis';

export function main() {
  const genesis = new Genesis();
  genesis.initialize();
  genesis.start();
}
`}
                </pre>
              </div>
            </>
          ) : (
            <div className="preview-empty">
              <span className="preview-empty-icon">📄</span>
              <span>Select a file to preview</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMMAND PALETTE (⌘K)
// ============================================================================

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
}

function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = [
    { id: 'overview', label: 'Go to Overview', icon: '◉', category: 'Navigation' },
    { id: 'chat', label: 'Open Chat', icon: '◈', category: 'Navigation' },
    { id: 'agents', label: 'View Agents', icon: '⬡', category: 'Navigation' },
    { id: 'tasks', label: 'Manage Tasks', icon: '◇', category: 'Navigation' },
    { id: 'creator', label: 'Creator Studio', icon: '✦', category: 'Navigation' },
    { id: 'terminal', label: 'Open Terminal', icon: '⌨', category: 'Navigation' },
    { id: 'analytics', label: 'View Analytics', icon: '📈', category: 'Navigation' },
    { id: 'files', label: 'File Explorer', icon: '📁', category: 'Navigation' },
    { id: 'memory', label: 'Memory Explorer', icon: '⬢', category: 'Navigation' },
    { id: 'settings', label: 'Settings', icon: '⚙', category: 'Navigation' },
    { id: 'new-task', label: 'Create New Task', icon: '+', category: 'Actions' },
    { id: 'new-agent', label: 'Start New Agent', icon: '▶', category: 'Actions' },
    { id: 'search-memory', label: 'Search Memories', icon: '⌕', category: 'Actions' },
  ];

  const filteredCommands = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
    }
  }, [isOpen]);

  const executeCommand = (id: string) => {
    if (['overview', 'chat', 'agents', 'tasks', 'creator', 'terminal', 'analytics', 'files', 'memory', 'settings'].includes(id)) {
      onNavigate(id as View);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="command-backdrop" onClick={onClose} />
      <motion.div
        className="command-palette"
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
      >
        <div className="command-input-wrapper">
          <Icons.search />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search..."
          />
          <span className="command-shortcut">ESC</span>
        </div>
        <div className="command-results">
          {filteredCommands.map(cmd => (
            <button
              key={cmd.id}
              className="command-item"
              onClick={() => executeCommand(cmd.id)}
            >
              <span className="command-icon">{cmd.icon}</span>
              <span className="command-label">{cmd.label}</span>
              <span className="command-category">{cmd.category}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

// ============================================================================
// LIVE COLLABORATORS INDICATOR
// ============================================================================

interface Collaborator {
  id: string;
  name: string;
  avatar: string;
  color: string;
  currentView: View;
  lastActive: number;
}

function LiveCollaborators() {
  const [collaborators] = useState<Collaborator[]>([
    { id: '1', name: 'Alice', avatar: 'A', color: '#a855f7', currentView: 'overview', lastActive: Date.now() },
    { id: '2', name: 'Bob', avatar: 'B', color: '#06b6d4', currentView: 'agents', lastActive: Date.now() - 30000 },
    { id: '3', name: 'Carol', avatar: 'C', color: '#10b981', currentView: 'chat', lastActive: Date.now() - 120000 },
  ]);

  return (
    <div className="live-collaborators">
      <div className="collab-avatars">
        {collaborators.slice(0, 3).map((collab, i) => (
          <motion.div
            key={collab.id}
            className="collab-avatar"
            style={{
              background: collab.color,
              zIndex: 3 - i,
              marginLeft: i > 0 ? -8 : 0
            }}
            title={`${collab.name} - ${collab.currentView}`}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          >
            {collab.avatar}
          </motion.div>
        ))}
        {collaborators.length > 3 && (
          <div className="collab-more">+{collaborators.length - 3}</div>
        )}
      </div>
      <span className="collab-label">Live</span>
    </div>
  );
}

// ============================================================================
// KEYBOARD SHORTCUTS PANEL
// ============================================================================

function ShortcutsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const shortcuts = [
    { category: 'Navigation', items: [
      { keys: ['⌘', 'K'], desc: 'Open Command Palette' },
      { keys: ['⌘', 'P'], desc: 'Global Search' },
      { keys: ['⌘', '1-9'], desc: 'Navigate to section' },
    ]},
    { category: 'Tools', items: [
      { keys: ['⌘', 'E'], desc: 'Code Editor' },
      { keys: ['⌘', '/'], desc: 'Documentation' },
      { keys: ['⌘', 'J'], desc: 'Quick AI assist' },
    ]},
    { category: 'Actions', items: [
      { keys: ['⌘', 'N'], desc: 'New task' },
      { keys: ['⌘', 'Enter'], desc: 'Send message' },
      { keys: ['⌘', 'S'], desc: 'Save changes' },
    ]},
    { category: 'General', items: [
      { keys: ['?'], desc: 'Show shortcuts' },
      { keys: ['Esc'], desc: 'Close panels' },
      { keys: ['⌘', 'D'], desc: 'Toggle dark mode' },
    ]},
  ];

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="shortcuts-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="shortcuts-panel"
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
      >
        <div className="shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="shortcuts-content">
          {shortcuts.map(cat => (
            <div key={cat.category} className="shortcut-category">
              <h3>{cat.category}</h3>
              {cat.items.map((item, i) => (
                <div key={i} className="shortcut-item">
                  <div className="shortcut-keys">
                    {item.keys.map((key, j) => (
                      <span key={j} className="key">{key}</span>
                    ))}
                  </div>
                  <span className="shortcut-desc">{item.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">
          Press <span className="key">?</span> to toggle this panel
        </div>
      </motion.div>
    </>
  );
}

// ============================================================================
// QUICK AI ASSISTANT
// ============================================================================

function QuickAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (!query.trim()) return;
    setLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        "Ho analizzato il sistema. Tutti i parametri sono nella norma. φ è stabile a 0.847.",
        "Il workflow è stato ottimizzato. Risparmio energetico del 15% previsto.",
        "3 agenti sono attualmente in esecuzione. Vuoi vedere i dettagli?",
        "L'integrazione con Slack è configurata correttamente. Pronto per le notifiche.",
        "Ho trovato 5 patterns rilevanti nella memoria episodica.",
      ];
      setResponse(responses[Math.floor(Math.random() * responses.length)]);
      setLoading(false);
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="quick-assist-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="quick-assist-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
      >
        <div className="assist-header">
          <span className="assist-icon">🧠</span>
          <span className="assist-title">Quick AI Assist</span>
          <span className="assist-shortcut">⌘J</span>
        </div>

        <div className="assist-input-row">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Ask Genesis anything..."
          />
          <button onClick={handleSubmit} disabled={loading}>
            {loading ? '...' : '→'}
          </button>
        </div>

        {response && (
          <motion.div
            className="assist-response"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <p>{response}</p>
          </motion.div>
        )}

        <div className="assist-suggestions">
          <span className="suggestion-label">Suggestions:</span>
          <div className="suggestions-list">
            {['System status', 'Active agents', 'Recent events', 'Memory stats'].map(s => (
              <button
                key={s}
                className="suggestion-chip"
                onClick={() => { setQuery(s); handleSubmit(); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ============================================================================
// THEME TOGGLE
// ============================================================================

function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button className="theme-toggle" onClick={onToggle} title="Toggle theme">
      <motion.div
        className="theme-icon"
        animate={{ rotate: isDark ? 0 : 180 }}
        transition={{ duration: 0.3 }}
      >
        {isDark ? '🌙' : '☀️'}
      </motion.div>
    </button>
  );
}

// ============================================================================
// USER PROFILE DROPDOWN
// ============================================================================

function UserProfile() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="user-profile">
      <button className="profile-trigger" onClick={() => setIsOpen(!isOpen)}>
        <div className="profile-avatar">L</div>
        <span className="profile-name">Luca</span>
        <span className="profile-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="profile-dropdown"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="dropdown-header">
              <div className="dropdown-avatar">L</div>
              <div className="dropdown-info">
                <span className="dropdown-name">Luca Rossignoli</span>
                <span className="dropdown-email">luca@genesis.ai</span>
              </div>
            </div>
            <div className="dropdown-divider" />
            <button className="dropdown-item">
              <span>👤</span> Profile Settings
            </button>
            <button className="dropdown-item">
              <span>🔔</span> Notifications
            </button>
            <button className="dropdown-item">
              <span>🎨</span> Appearance
            </button>
            <button className="dropdown-item">
              <span>🔗</span> API Keys
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item logout">
              <span>🚪</span> Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// NOTIFICATION BELL
// ============================================================================

function NotificationBell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button className="notification-bell" onClick={onClick}>
      <span className="bell-icon">🔔</span>
      {count > 0 && (
        <motion.span
          className="bell-badge"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          key={count}
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </button>
  );
}

// ============================================================================
// VOICE COMMAND INDICATOR
// ============================================================================

function VoiceCommand({ isListening, onToggle }: { isListening: boolean; onToggle: () => void }) {
  return (
    <button
      className={`voice-command ${isListening ? 'listening' : ''}`}
      onClick={onToggle}
      title="Voice Commands"
    >
      <motion.span
        animate={isListening ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        🎤
      </motion.span>
      {isListening && (
        <div className="voice-waves">
          <span /><span /><span />
        </div>
      )}
    </button>
  );
}

// ============================================================================
// GLOBAL SEARCH WITH PREVIEW
// ============================================================================

interface SearchResult {
  id: string;
  type: 'file' | 'agent' | 'task' | 'memory' | 'setting' | 'doc';
  title: string;
  description: string;
  path?: string;
  icon: string;
}

function GlobalSearch({ isOpen, onClose, onNavigate }: { isOpen: boolean; onClose: () => void; onNavigate: (view: View) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems: SearchResult[] = useMemo(() => [
    { id: '1', type: 'file', title: 'App.tsx', description: 'Main application component', path: 'src/dashboard/App.tsx', icon: '📄' },
    { id: '2', type: 'file', title: 'consciousness.ts', description: 'Consciousness module', path: 'src/kernel/consciousness.ts', icon: '📄' },
    { id: '3', type: 'agent', title: 'Explorer Agent', description: 'Research and exploration agent', icon: '🤖' },
    { id: '4', type: 'agent', title: 'Writer Agent', description: 'Content generation agent', icon: '🤖' },
    { id: '5', type: 'agent', title: 'Analyst Agent', description: 'Data analysis agent', icon: '🤖' },
    { id: '6', type: 'task', title: 'Implement auth flow', description: 'Add authentication system', icon: '◇' },
    { id: '7', type: 'task', title: 'Fix memory leak', description: 'Critical bug in kernel', icon: '◇' },
    { id: '8', type: 'memory', title: 'Project overview', description: 'Semantic memory about the project', icon: '💾' },
    { id: '9', type: 'memory', title: 'API patterns', description: 'Procedural memory for API design', icon: '💾' },
    { id: '10', type: 'setting', title: 'API Keys', description: 'Configure API provider keys', icon: '⚙️' },
    { id: '11', type: 'setting', title: 'MCP Servers', description: 'Manage MCP connections', icon: '⚙️' },
    { id: '12', type: 'doc', title: 'Getting Started', description: 'Quick start guide', icon: '📚' },
    { id: '13', type: 'doc', title: 'API Reference', description: 'Complete API documentation', icon: '📚' },
  ], []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      const filtered = allItems.filter(item =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
      setLoading(false);
      setSelectedIndex(0);
    }, 150);

    return () => clearTimeout(timer);
  }, [query, allItems]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'agent') onNavigate('agents');
    else if (result.type === 'task') onNavigate('tasks');
    else if (result.type === 'file') onNavigate('files');
    else if (result.type === 'memory') onNavigate('memory');
    else if (result.type === 'setting') onNavigate('settings');
    else if (result.type === 'doc') onNavigate('overview');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="global-search-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="global-search"
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
      >
        <div className="search-input-container">
          <Icons.search />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files, agents, tasks, docs..."
          />
          {loading && <div className="search-spinner" />}
        </div>

        {query && (
          <div className="search-results">
            {results.length === 0 && !loading ? (
              <div className="no-results">No results found for "{query}"</div>
            ) : (
              results.map((result, i) => (
                <motion.div
                  key={result.id}
                  className={`search-result ${i === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleSelect(result)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <span className="result-icon">{result.icon}</span>
                  <div className="result-info">
                    <span className="result-title">{result.title}</span>
                    <span className="result-desc">{result.description}</span>
                    {result.path && <span className="result-path">{result.path}</span>}
                  </div>
                  <span className="result-type">{result.type}</span>
                </motion.div>
              ))
            )}
          </div>
        )}

        {!query && (
          <div className="search-hints">
            <div className="hint-section">
              <span className="hint-label">Quick Actions</span>
              <div className="hint-actions">
                <button onClick={() => setQuery('agent:')}>Search Agents</button>
                <button onClick={() => setQuery('file:')}>Search Files</button>
                <button onClick={() => setQuery('task:')}>Search Tasks</button>
              </div>
            </div>
            <div className="hint-section">
              <span className="hint-label">Recent</span>
              <div className="recent-items">
                {allItems.slice(0, 3).map(item => (
                  <div key={item.id} className="recent-item" onClick={() => handleSelect(item)}>
                    <span>{item.icon}</span>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}

// ============================================================================
// PERFORMANCE MONITOR
// ============================================================================

function PerformanceMonitor() {
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(30).fill(0));
  const [memHistory, setMemHistory] = useState<number[]>(Array(30).fill(0));
  const [netHistory, setNetHistory] = useState<number[]>(Array(30).fill(0));
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpuHistory(prev => [...prev.slice(1), 20 + Math.random() * 40]);
      setMemHistory(prev => [...prev.slice(1), 40 + Math.random() * 30]);
      setNetHistory(prev => [...prev.slice(1), Math.random() * 100]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const renderGraph = (data: number[], color: string, label: string) => {
    const max = Math.max(...data, 100);
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (val / max) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="perf-graph">
        <div className="graph-header">
          <span className="graph-label">{label}</span>
          <span className="graph-value" style={{ color }}>{data[data.length - 1].toFixed(1)}%</span>
        </div>
        <svg viewBox="0 0 100 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon
            points={`0,50 ${points} 100,50`}
            fill={`url(#grad-${label})`}
          />
        </svg>
      </div>
    );
  };

  return (
    <motion.div
      className={`perf-monitor ${isExpanded ? 'expanded' : ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="perf-header">
        <span className="perf-title">⚡ Performance</span>
        <span className="perf-toggle">{isExpanded ? '▼' : '▶'}</span>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="perf-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {renderGraph(cpuHistory, '#a855f7', 'CPU')}
            {renderGraph(memHistory, '#06b6d4', 'Memory')}
            {renderGraph(netHistory, '#10b981', 'Network')}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// CODE EDITOR (Mini)
// ============================================================================

function CodeEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [code, setCode] = useState(`// Genesis Script Editor
import { Genesis } from '@genesis/core';

async function main() {
  const genesis = new Genesis();

  // Start an agent
  const agent = await genesis.agents.spawn('analyst', {
    goal: 'Analyze system metrics',
    context: genesis.memory.recent(10)
  });

  // Wait for result
  const result = await agent.execute();
  console.log('Result:', result);
}

main();
`);
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const runCode = () => {
    setRunning(true);
    setOutput([]);

    // Simulate execution
    const logs = [
      '> Initializing Genesis...',
      '> Spawning analyst agent...',
      '> Agent started: analyst-7f3d',
      '> Executing goal: "Analyze system metrics"',
      '> Fetching context from memory...',
      '> Processing 10 memory items...',
      '> Analysis complete!',
      '> Result: { health: 0.92, anomalies: 0, suggestions: 2 }'
    ];

    logs.forEach((log, i) => {
      setTimeout(() => {
        setOutput(prev => [...prev, log]);
        if (i === logs.length - 1) setRunning(false);
      }, (i + 1) * 400);
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="editor-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="code-editor-panel"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <div className="editor-header">
          <div className="editor-tabs">
            <span className="editor-tab active">script.ts</span>
            <button className="new-tab">+</button>
          </div>
          <div className="editor-actions">
            <button className="run-btn" onClick={runCode} disabled={running}>
              {running ? '⏳ Running...' : '▶ Run'}
            </button>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="editor-body">
          <div className="editor-main">
            <div className="line-numbers">
              {code.split('\n').map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="editor-output">
            <div className="output-header">
              <span>Console Output</span>
              <button onClick={() => setOutput([])}>Clear</button>
            </div>
            <div className="output-content">
              {output.length === 0 ? (
                <span className="output-placeholder">Run your script to see output...</span>
              ) : (
                output.map((line, i) => (
                  <motion.div
                    key={i}
                    className="output-line"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    {line}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ============================================================================
// ONBOARDING FLOW
// ============================================================================

function OnboardingFlow({ isOpen, onComplete }: { isOpen: boolean; onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to Genesis',
      description: 'The most advanced AI system interface ever created. Let\'s take a quick tour.',
      icon: '🚀'
    },
    {
      title: 'Command Palette',
      description: 'Press ⌘K anywhere to open the command palette. Search for anything, navigate quickly.',
      icon: '⌘'
    },
    {
      title: 'AI Agents',
      description: 'Genesis has 10 specialized agents. Each can be started, stopped, and monitored in real-time.',
      icon: '🤖'
    },
    {
      title: 'Real-time Updates',
      description: 'Everything updates live via SSE. Consciousness, memory, kernel - all in sync.',
      icon: '⚡'
    },
    {
      title: 'Workflow Builder',
      description: 'Create complex automation flows with our visual node editor. Drag, connect, deploy.',
      icon: '⛓'
    },
    {
      title: 'You\'re Ready!',
      description: 'Explore the interface. Press ? for keyboard shortcuts. Have fun building the future.',
      icon: '✨'
    }
  ];

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="onboarding-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="onboarding-modal"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
      >
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`progress-dot ${i === step ? 'active' : i < step ? 'completed' : ''}`}
            />
          ))}
        </div>

        <motion.div
          key={step}
          className="onboarding-content"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          <span className="onboarding-icon">{steps[step].icon}</span>
          <h2>{steps[step].title}</h2>
          <p>{steps[step].description}</p>
        </motion.div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="back-btn" onClick={prevStep}>
              ← Back
            </button>
          )}
          <button className="next-btn" onClick={nextStep}>
            {step === steps.length - 1 ? 'Get Started' : 'Next →'}
          </button>
        </div>

        <button className="skip-btn" onClick={onComplete}>
          Skip tour
        </button>
      </motion.div>
    </>
  );
}

// ============================================================================
// DOCS VIEWER
// ============================================================================

function DocsViewer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeDoc, setActiveDoc] = useState('getting-started');

  const docs = [
    { id: 'getting-started', title: 'Getting Started', icon: '🚀' },
    { id: 'agents', title: 'Agents Guide', icon: '🤖' },
    { id: 'api', title: 'API Reference', icon: '📡' },
    { id: 'workflows', title: 'Workflows', icon: '⛓' },
    { id: 'memory', title: 'Memory System', icon: '💾' },
    { id: 'integrations', title: 'Integrations', icon: '🔌' },
  ];

  const docContent: Record<string, string> = {
    'getting-started': `
# Getting Started with Genesis

Genesis is an autonomous AI system with consciousness-inspired architecture.

## Quick Start

1. **Connect to Genesis**: The dashboard automatically connects via SSE
2. **Monitor the System**: Watch real-time metrics on the Overview
3. **Chat with Genesis**: Use the Chat interface to interact
4. **Run Agents**: Start specialized agents from the Agents panel

## Key Concepts

### Consciousness (φ)
The system's integrated information level, measured in bits.

### Neuromodulation
Four simulated neurotransmitters affect system behavior:
- **Dopamine**: Motivation and reward
- **Serotonin**: Mood stability
- **Norepinephrine**: Alertness
- **Cortisol**: Stress response

### Active Inference
Genesis minimizes free energy to maintain homeostasis.
    `,
    'agents': `
# Agents Guide

Genesis includes 10 specialized AI agents.

## Available Agents

| Agent | Type | Purpose |
|-------|------|---------|
| Explorer | Research | Information gathering |
| Writer | Content | Text generation |
| Analyst | Analysis | Data analysis |
| Coder | Development | Code generation |
| Planner | Planning | Strategic planning |
| Critic | Review | Quality assurance |
| Memory | Storage | Memory management |
| Executor | Execution | Task execution |
| Monitor | Monitoring | System monitoring |
| Dreamer | Creative | Creative ideation |

## Starting an Agent

\`\`\`typescript
await genesis.agents.start('analyst', {
  goal: 'Analyze metrics',
  context: { ... }
});
\`\`\`
    `,
    'api': `
# API Reference

## Endpoints

### GET /api/metrics
Returns current system metrics.

### POST /api/chat
Send a message to Genesis.

### GET /api/agents
List all agents and their status.

### POST /api/agents/:id/start
Start a specific agent.

### GET /api/events
SSE stream of real-time events.
    `,
    'workflows': `
# Workflows Guide

Build complex automations with the visual Workflow Builder.

## Node Types

- **Trigger**: Starts the workflow (on message, schedule, event)
- **Condition**: Branch based on criteria
- **Action**: Execute an agent or API call
- **Output**: Send response or store result

## Creating a Workflow

1. Open the Workflow Builder
2. Add a Trigger node
3. Connect to Actions and Conditions
4. Add an Output node
5. Save and activate
    `,
    'memory': `
# Memory System

Genesis has three types of memory:

## Episodic Memory
Stores specific events and experiences with timestamps.

## Semantic Memory
Stores facts, concepts, and general knowledge.

## Procedural Memory
Stores skills, patterns, and how-to knowledge.

## Memory Operations

- **Store**: Add new memories
- **Retrieve**: Search and recall
- **Consolidate**: Strengthen important memories
- **Forget**: Decay unimportant memories
    `,
    'integrations': `
# Integrations

Connect Genesis to external services.

## Available Integrations

- **Slack**: Team notifications
- **GitHub**: Code repository
- **Linear**: Issue tracking
- **PostgreSQL**: Database
- **Redis**: Caching
- **OpenAI/Anthropic**: LLM providers

## Adding an Integration

1. Go to Integrations page
2. Click Connect on desired service
3. Authenticate and configure
4. Test the connection
    `
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="docs-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="docs-viewer"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
      >
        <div className="docs-header">
          <h2>📚 Documentation</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="docs-layout">
          <nav className="docs-nav">
            {docs.map(doc => (
              <button
                key={doc.id}
                className={`docs-nav-item ${activeDoc === doc.id ? 'active' : ''}`}
                onClick={() => setActiveDoc(doc.id)}
              >
                <span>{doc.icon}</span>
                <span>{doc.title}</span>
              </button>
            ))}
          </nav>

          <div className="docs-content">
            <div className="markdown-body">
              {docContent[activeDoc]?.split('\n').map((line, i) => {
                if (line.startsWith('# ')) {
                  return <h1 key={i}>{line.slice(2)}</h1>;
                } else if (line.startsWith('## ')) {
                  return <h2 key={i}>{line.slice(3)}</h2>;
                } else if (line.startsWith('### ')) {
                  return <h3 key={i}>{line.slice(4)}</h3>;
                } else if (line.startsWith('- ')) {
                  return <li key={i}>{line.slice(2)}</li>;
                } else if (line.startsWith('```')) {
                  return null; // Skip code fence markers
                } else if (line.startsWith('|')) {
                  return <code key={i} className="table-row">{line}</code>;
                } else if (line.trim()) {
                  return <p key={i}>{line}</p>;
                }
                return null;
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
}

function NotificationCenter({ notifications, onDismiss }: { notifications: Notification[]; onDismiss: (id: string) => void }) {
  return (
    <div className="notification-center">
      <AnimatePresence>
        {notifications.map(notif => (
          <motion.div
            key={notif.id}
            className={`notification ${notif.type}`}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
          >
            <div className="notification-content">
              <strong>{notif.title}</strong>
              <p>{notif.message}</p>
            </div>
            <button className="notification-close" onClick={() => onDismiss(notif.id)}>
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ACTIVITY FEED (Real-time events)
// ============================================================================

function ActivityFeed() {
  const { events } = useGenesisStore();
  const [filter, setFilter] = useState<'all' | 'system' | 'agents' | 'user'>('all');

  const recentEvents = events.slice(0, 20);

  const getEventIcon = (type: string) => {
    if (type.includes('consciousness')) return '🧠';
    if (type.includes('agent')) return '🤖';
    if (type.includes('memory')) return '💾';
    if (type.includes('kernel')) return '⚙️';
    if (type.includes('economy')) return '💰';
    return '◉';
  };

  const getEventColor = (type: string) => {
    if (type.includes('error')) return 'var(--accent-red)';
    if (type.includes('success')) return 'var(--accent-green)';
    if (type.includes('warning')) return 'var(--accent-orange)';
    return 'var(--accent-purple)';
  };

  return (
    <div className="activity-feed">
      <div className="feed-header">
        <h3>Activity Feed</h3>
        <div className="feed-filters">
          {(['all', 'system', 'agents', 'user'] as const).map(f => (
            <button
              key={f}
              className={`feed-filter ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="feed-content">
        {recentEvents.length === 0 ? (
          <div className="feed-empty">No recent events</div>
        ) : (
          recentEvents.map(event => (
            <motion.div
              key={event.id}
              className="feed-item"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <span
                className="feed-icon"
                style={{ color: getEventColor(event.type) }}
              >
                {getEventIcon(event.type)}
              </span>
              <div className="feed-info">
                <span className="feed-type">{event.type}</span>
                <span className="feed-time">
                  {new Date(event.timestamp).toLocaleTimeString('it-IT')}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SYSTEM HEALTH INDICATOR
// ============================================================================

function SystemHealth() {
  const { consciousness, kernel, memory, agents } = useGenesisStore();

  const healthMetrics = [
    {
      name: 'Consciousness',
      value: consciousness.phi,
      status: consciousness.phi > 0.7 ? 'good' : consciousness.phi > 0.4 ? 'warn' : 'bad',
      icon: '🧠'
    },
    {
      name: 'Kernel',
      value: 1 - kernel.freeEnergy / 5,
      status: kernel.freeEnergy < 2 ? 'good' : kernel.freeEnergy < 4 ? 'warn' : 'bad',
      icon: '⚡'
    },
    {
      name: 'Memory',
      value: (memory.episodic + memory.semantic + memory.procedural) / 2000,
      status: 'good',
      icon: '💾'
    },
    {
      name: 'Agents',
      value: agents.active / Math.max(1, agents.total),
      status: agents.active > 0 ? 'good' : 'warn',
      icon: '🤖'
    }
  ];

  const overallHealth = healthMetrics.reduce((acc, m) => acc + m.value, 0) / healthMetrics.length;
  const overallStatus = overallHealth > 0.6 ? 'good' : overallHealth > 0.3 ? 'warn' : 'bad';

  return (
    <div className="system-health">
      <div className="health-overall">
        <div className={`health-ring ${overallStatus}`}>
          <svg viewBox="0 0 36 36">
            <path
              className="ring-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="ring-progress"
              strokeDasharray={`${overallHealth * 100}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="health-percent">{Math.round(overallHealth * 100)}%</span>
        </div>
        <span className="health-label">System Health</span>
      </div>
      <div className="health-metrics">
        {healthMetrics.map(metric => (
          <div key={metric.name} className="health-metric">
            <span className="metric-icon">{metric.icon}</span>
            <span className="metric-name">{metric.name}</span>
            <div className="metric-bar">
              <div
                className={`metric-fill ${metric.status}`}
                style={{ width: `${metric.value * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// BREADCRUMBS
// ============================================================================

function Breadcrumbs({ currentView }: { currentView: View }) {
  const viewLabels: Record<View, string> = {
    overview: 'Overview',
    consciousness: 'Consciousness',
    neuromod: 'Neuromodulation',
    ness: 'NESS Economy',
    chat: 'Chat',
    agents: 'Agents',
    tasks: 'Tasks',
    creator: 'Creator Studio',
    terminal: 'Terminal',
    analytics: 'Analytics',
    files: 'File Explorer',
    memory: 'Memory',
    settings: 'Settings',
    workflow: 'Workflow Builder',
    playground: 'API Playground',
    integrations: 'Integrations',
    marketplace: 'Marketplace',
    mcp: 'MCP Hub',
    codemind: 'Code Mind',
    evolution: 'Evolution',
    sandbox: 'Sandbox',
    lessons: 'Lessons',
    history: 'History',
    inference: 'Active Inference',
    pain: 'Nociception',
    allostasis: 'Allostasis',
    worldmodel: 'World Model',
    daemon: 'Daemon',
    finance: 'Finance',
    revenue: 'Revenue',
    content: 'Content',
    swarm: 'Swarm',
    healing: 'Healing',
    grounding: 'Grounding',
  };

  return (
    <nav className="breadcrumbs">
      <span className="crumb home">Genesis</span>
      <span className="crumb-sep">›</span>
      <span className="crumb current">{viewLabels[currentView]}</span>
    </nav>
  );
}

// ============================================================================
// SETTINGS VIEW
// ============================================================================

function SettingsView() {
  const [settings, setSettings] = useState({
    apiKey: '••••••••••••••••',
    defaultProvider: 'anthropic',
    autoSave: true,
    darkMode: true,
    notifications: true,
    mcpServers: [
      { name: 'filesystem', enabled: true },
      { name: 'github', enabled: true },
      { name: 'slack', enabled: false },
      { name: 'linear', enabled: true },
      { name: 'postgres', enabled: false },
    ],
  });

  return (
    <div className="settings-view">
      <div className="view-header">
        <h2>Impostazioni</h2>
      </div>

      <div className="settings-sections">
        <section className="settings-section">
          <h3>API & Provider</h3>
          <div className="setting-item">
            <label>API Key</label>
            <div className="input-group">
              <input type="password" value={settings.apiKey} readOnly />
              <button>Modifica</button>
            </div>
          </div>
          <div className="setting-item">
            <label>Provider Default</label>
            <select
              value={settings.defaultProvider}
              onChange={e => setSettings(prev => ({ ...prev, defaultProvider: e.target.value }))}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT-4)</option>
              <option value="google">Google (Gemini)</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h3>MCP Servers</h3>
          <div className="mcp-list">
            {settings.mcpServers.map((server, i) => (
              <div key={server.name} className="mcp-item">
                <span className="mcp-name">{server.name}</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    onChange={e => {
                      const newServers = [...settings.mcpServers];
                      newServers[i].enabled = e.target.checked;
                      setSettings(prev => ({ ...prev, mcpServers: newServers }));
                    }}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>
          <button className="add-mcp">
            <Icons.plus /> Aggiungi Server
          </button>
        </section>

        <section className="settings-section">
          <h3>Preferenze</h3>
          <div className="setting-item toggle-item">
            <label>Salvataggio automatico</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoSave}
                onChange={e => setSettings(prev => ({ ...prev, autoSave: e.target.checked }))}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="setting-item toggle-item">
            <label>Notifiche</label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={e => setSettings(prev => ({ ...prev, notifications: e.target.checked }))}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// WORKFLOW BUILDER - Visual Node Editor
// ============================================================================

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'output';
  name: string;
  x: number;
  y: number;
  config: Record<string, any>;
  connections: string[];
}

function WorkflowView() {
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: '1', type: 'trigger', name: 'On Message', x: 100, y: 150, config: { channel: 'general' }, connections: ['2'] },
    { id: '2', type: 'condition', name: 'Contains keyword?', x: 350, y: 100, config: { keyword: 'help' }, connections: ['3', '4'] },
    { id: '3', type: 'action', name: 'Agent: Analyst', x: 600, y: 50, config: { agent: 'analyst' }, connections: ['5'] },
    { id: '4', type: 'action', name: 'Agent: Writer', x: 600, y: 200, config: { agent: 'writer' }, connections: ['5'] },
    { id: '5', type: 'output', name: 'Reply', x: 850, y: 125, config: { format: 'markdown' }, connections: [] },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const nodeColors = {
    trigger: '#10b981',
    action: '#a855f7',
    condition: '#f59e0b',
    output: '#06b6d4',
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(nodeId);
      setIsDragging(true);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && selectedNode) {
      const canvas = e.currentTarget.getBoundingClientRect();
      const newX = e.clientX - canvas.left - dragOffset.x;
      const newY = e.clientY - canvas.top - dragOffset.y;
      setNodes(prev => prev.map(n =>
        n.id === selectedNode ? { ...n, x: Math.max(0, newX), y: Math.max(0, newY) } : n
      ));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const addNode = (type: WorkflowNode['type']) => {
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      name: type === 'trigger' ? 'New Trigger' : type === 'action' ? 'New Action' : type === 'condition' ? 'New Condition' : 'New Output',
      x: 200 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      config: {},
      connections: [],
    };
    setNodes(prev => [...prev, newNode]);
  };

  const renderConnections = () => {
    const lines: React.ReactNode[] = [];
    nodes.forEach(node => {
      node.connections.forEach(targetId => {
        const target = nodes.find(n => n.id === targetId);
        if (target) {
          const x1 = node.x + 150;
          const y1 = node.y + 35;
          const x2 = target.x;
          const y2 = target.y + 35;
          const midX = (x1 + x2) / 2;

          lines.push(
            <path
              key={`${node.id}-${targetId}`}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              stroke="rgba(168, 85, 247, 0.5)"
              strokeWidth="2"
              fill="none"
              className="connection-line"
            />
          );
        }
      });
    });
    return lines;
  };

  return (
    <div className="workflow-view">
      <div className="view-header">
        <h2>Workflow Builder</h2>
        <div className="workflow-actions">
          <button className="workflow-btn" onClick={() => addNode('trigger')}>
            <span style={{ color: nodeColors.trigger }}>◉</span> Trigger
          </button>
          <button className="workflow-btn" onClick={() => addNode('condition')}>
            <span style={{ color: nodeColors.condition }}>◇</span> Condition
          </button>
          <button className="workflow-btn" onClick={() => addNode('action')}>
            <span style={{ color: nodeColors.action }}>⬡</span> Action
          </button>
          <button className="workflow-btn" onClick={() => addNode('output')}>
            <span style={{ color: nodeColors.output }}>◈</span> Output
          </button>
          <button className="workflow-save">Save Workflow</button>
        </div>
      </div>

      <div className="workflow-container">
        <div
          className="workflow-canvas"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg className="connections-layer">
            {renderConnections()}
          </svg>

          {nodes.map(node => (
            <motion.div
              key={node.id}
              className={`workflow-node ${node.type} ${selectedNode === node.id ? 'selected' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                borderColor: nodeColors[node.type],
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              whileHover={{ scale: 1.02 }}
            >
              <div className="node-header" style={{ background: nodeColors[node.type] }}>
                <span className="node-type">{node.type}</span>
              </div>
              <div className="node-body">
                <span className="node-name">{node.name}</span>
              </div>
              <div className="node-ports">
                <div className="port input" />
                <div className="port output" />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="workflow-sidebar">
          {selectedNode ? (
            <div className="node-config">
              <h3>Node Configuration</h3>
              <div className="config-field">
                <label>Name</label>
                <input
                  type="text"
                  value={nodes.find(n => n.id === selectedNode)?.name || ''}
                  onChange={(e) => setNodes(prev => prev.map(n =>
                    n.id === selectedNode ? { ...n, name: e.target.value } : n
                  ))}
                />
              </div>
              <div className="config-field">
                <label>Type</label>
                <span className="config-value">{nodes.find(n => n.id === selectedNode)?.type}</span>
              </div>
              <button className="delete-node" onClick={() => {
                setNodes(prev => prev.filter(n => n.id !== selectedNode));
                setSelectedNode(null);
              }}>
                Delete Node
              </button>
            </div>
          ) : (
            <div className="no-selection">
              <span>Select a node to configure</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// API PLAYGROUND - Interactive API Testing
// ============================================================================

function PlaygroundView() {
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('POST');
  const [endpoint, setEndpoint] = useState('/api/chat');
  const [requestBody, setRequestBody] = useState(JSON.stringify({
    message: "Hello Genesis!",
    agent: "default",
    context: []
  }, null, 2));
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ method: string; endpoint: string; timestamp: number; status: number }>>([
    { method: 'POST', endpoint: '/api/chat', timestamp: Date.now() - 60000, status: 200 },
    { method: 'GET', endpoint: '/api/metrics', timestamp: Date.now() - 120000, status: 200 },
    { method: 'POST', endpoint: '/api/agents/start', timestamp: Date.now() - 180000, status: 201 },
  ]);

  const endpoints = [
    { path: '/api/chat', method: 'POST', desc: 'Send a message to Genesis' },
    { path: '/api/metrics', method: 'GET', desc: 'Get system metrics' },
    { path: '/api/agents', method: 'GET', desc: 'List all agents' },
    { path: '/api/agents/start', method: 'POST', desc: 'Start an agent' },
    { path: '/api/memory/search', method: 'POST', desc: 'Search memories' },
    { path: '/api/tasks', method: 'GET', desc: 'List tasks' },
    { path: '/api/events', method: 'GET', desc: 'SSE event stream' },
  ];

  const executeRequest = async () => {
    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      const mockResponse = {
        success: true,
        data: {
          message: "Response from Genesis",
          agent: "analyst",
          tokens: 150,
          latency: "234ms"
        },
        timestamp: new Date().toISOString()
      };

      setResponse(JSON.stringify(mockResponse, null, 2));
      setHistory(prev => [{
        method,
        endpoint,
        timestamp: Date.now(),
        status: 200
      }, ...prev.slice(0, 9)]);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="playground-view">
      <div className="view-header">
        <h2>API Playground</h2>
        <div className="playground-info">
          Base URL: <code>http://localhost:9876</code>
        </div>
      </div>

      <div className="playground-layout">
        <div className="playground-main">
          <div className="request-builder">
            <div className="request-line">
              <select value={method} onChange={e => setMethod(e.target.value as any)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="text"
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
                placeholder="/api/endpoint"
              />
              <button
                className="send-btn"
                onClick={executeRequest}
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>

            <div className="request-body">
              <div className="section-header">
                <span>Request Body</span>
                <button onClick={() => {
                  try {
                    const formatted = JSON.stringify(JSON.parse(requestBody), null, 2);
                    setRequestBody(formatted);
                  } catch {}
                }}>Format</button>
              </div>
              <textarea
                value={requestBody}
                onChange={e => setRequestBody(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          <div className="response-viewer">
            <div className="section-header">
              <span>Response</span>
              {response && <span className="status-badge success">200 OK</span>}
            </div>
            <div className="response-content">
              {loading ? (
                <div className="loading-response">
                  <div className="spinner" />
                  <span>Executing request...</span>
                </div>
              ) : response ? (
                <pre>{response}</pre>
              ) : (
                <div className="empty-response">
                  Send a request to see the response
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="playground-sidebar">
          <div className="endpoints-list">
            <h3>Quick Endpoints</h3>
            {endpoints.map(ep => (
              <button
                key={ep.path}
                className="endpoint-item"
                onClick={() => {
                  setEndpoint(ep.path);
                  setMethod(ep.method as any);
                }}
              >
                <span className={`method-badge ${ep.method.toLowerCase()}`}>{ep.method}</span>
                <span className="endpoint-path">{ep.path}</span>
              </button>
            ))}
          </div>

          <div className="request-history">
            <h3>History</h3>
            {history.map((item, i) => (
              <div key={i} className="history-item">
                <span className={`method-badge ${item.method.toLowerCase()}`}>{item.method}</span>
                <span className="endpoint-path">{item.endpoint}</span>
                <span className={`status ${item.status < 400 ? 'success' : 'error'}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTEGRATIONS VIEW - External Services
// ============================================================================

interface Integration {
  id: string;
  name: string;
  icon: string;
  category: 'ai' | 'communication' | 'storage' | 'development' | 'other';
  status: 'connected' | 'disconnected' | 'error';
  description: string;
}

function IntegrationsView() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    { id: '1', name: 'Slack', icon: '💬', category: 'communication', status: 'connected', description: 'Team messaging and notifications' },
    { id: '2', name: 'GitHub', icon: '🐙', category: 'development', status: 'connected', description: 'Repository management and CI/CD' },
    { id: '3', name: 'Linear', icon: '📋', category: 'development', status: 'connected', description: 'Issue tracking and project management' },
    { id: '4', name: 'PostgreSQL', icon: '🐘', category: 'storage', status: 'disconnected', description: 'Relational database' },
    { id: '5', name: 'OpenAI', icon: '🤖', category: 'ai', status: 'connected', description: 'GPT-4 language model' },
    { id: '6', name: 'Anthropic', icon: '🧠', category: 'ai', status: 'connected', description: 'Claude language model' },
    { id: '7', name: 'Google Drive', icon: '📁', category: 'storage', status: 'disconnected', description: 'Cloud file storage' },
    { id: '8', name: 'Discord', icon: '🎮', category: 'communication', status: 'disconnected', description: 'Community chat platform' },
    { id: '9', name: 'Notion', icon: '📝', category: 'other', status: 'error', description: 'Workspace and documentation' },
    { id: '10', name: 'Redis', icon: '⚡', category: 'storage', status: 'connected', description: 'In-memory data store' },
  ]);

  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const categories = ['all', 'ai', 'communication', 'storage', 'development', 'other'];

  const filteredIntegrations = integrations.filter(int => {
    const matchesFilter = filter === 'all' || int.category === filter;
    const matchesSearch = int.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const toggleConnection = (id: string) => {
    setIntegrations(prev => prev.map(int =>
      int.id === id ? {
        ...int,
        status: int.status === 'connected' ? 'disconnected' : 'connected'
      } : int
    ));
  };

  const statusColors = {
    connected: '#10b981',
    disconnected: '#71717a',
    error: '#ef4444',
  };

  return (
    <div className="integrations-view">
      <div className="view-header">
        <h2>Integrations</h2>
        <button className="add-integration-btn">
          <Icons.plus /> Add Integration
        </button>
      </div>

      <div className="integrations-filters">
        <div className="search-box">
          <Icons.search />
          <input
            type="text"
            placeholder="Search integrations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="category-tabs">
          {categories.map(cat => (
            <button
              key={cat}
              className={`category-tab ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="integrations-stats">
        <div className="stat-card">
          <span className="stat-value">{integrations.filter(i => i.status === 'connected').length}</span>
          <span className="stat-label">Connected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{integrations.filter(i => i.status === 'disconnected').length}</span>
          <span className="stat-label">Available</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{integrations.filter(i => i.status === 'error').length}</span>
          <span className="stat-label">Errors</span>
        </div>
      </div>

      <div className="integrations-grid">
        {filteredIntegrations.map(int => (
          <motion.div
            key={int.id}
            className={`integration-card ${int.status}`}
            whileHover={{ scale: 1.02 }}
          >
            <div className="integration-header">
              <span className="integration-icon">{int.icon}</span>
              <div className="integration-info">
                <h3>{int.name}</h3>
                <span className="integration-category">{int.category}</span>
              </div>
              <div className="integration-status" style={{ background: statusColors[int.status] }} />
            </div>
            <p className="integration-desc">{int.description}</p>
            <div className="integration-actions">
              <button
                className={`connect-btn ${int.status === 'connected' ? 'disconnect' : ''}`}
                onClick={() => toggleConnection(int.id)}
              >
                {int.status === 'connected' ? 'Disconnect' : 'Connect'}
              </button>
              <button className="configure-btn">Configure</button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MARKETPLACE VIEW - Agents & Plugins
// ============================================================================

interface MarketplaceItem {
  id: string;
  name: string;
  author: string;
  type: 'agent' | 'plugin' | 'workflow' | 'theme';
  description: string;
  rating: number;
  downloads: number;
  price: 'free' | number;
  installed: boolean;
  verified: boolean;
  tags: string[];
}

function MarketplaceView() {
  const [items, setItems] = useState<MarketplaceItem[]>([
    { id: '1', name: 'Research Agent Pro', author: 'Genesis Labs', type: 'agent', description: 'Advanced research capabilities with multi-source synthesis', rating: 4.9, downloads: 12500, price: 'free', installed: false, verified: true, tags: ['research', 'analysis'] },
    { id: '2', name: 'Code Review Agent', author: 'DevTools Inc', type: 'agent', description: 'Automated code review with security analysis', rating: 4.7, downloads: 8300, price: 29, installed: true, verified: true, tags: ['code', 'security'] },
    { id: '3', name: 'Slack Bot Plugin', author: 'Community', type: 'plugin', description: 'Full Slack integration with smart notifications', rating: 4.5, downloads: 6200, price: 'free', installed: false, verified: false, tags: ['slack', 'notifications'] },
    { id: '4', name: 'Data Viz Workflow', author: 'DataStudio', type: 'workflow', description: 'Automatic data visualization generation', rating: 4.8, downloads: 4100, price: 49, installed: false, verified: true, tags: ['data', 'charts'] },
    { id: '5', name: 'Cyberpunk Theme', author: 'DesignHub', type: 'theme', description: 'Neon-infused dark theme for Genesis', rating: 4.6, downloads: 15800, price: 'free', installed: false, verified: false, tags: ['theme', 'dark'] },
    { id: '6', name: 'Financial Analyst', author: 'FinTech Pro', type: 'agent', description: 'Market analysis and financial reporting', rating: 4.4, downloads: 3200, price: 99, installed: false, verified: true, tags: ['finance', 'analysis'] },
    { id: '7', name: 'Content Writer Elite', author: 'WriteAI', type: 'agent', description: 'Long-form content generation with SEO', rating: 4.8, downloads: 9700, price: 19, installed: true, verified: true, tags: ['writing', 'seo'] },
    { id: '8', name: 'GitHub Actions Plugin', author: 'DevOps Hub', type: 'plugin', description: 'Deep GitHub integration with workflow automation', rating: 4.7, downloads: 7400, price: 'free', installed: false, verified: true, tags: ['github', 'ci-cd'] },
  ]);

  const [filter, setFilter] = useState<'all' | 'agent' | 'plugin' | 'workflow' | 'theme'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'newest'>('popular');

  const filteredItems = items
    .filter(item => {
      const matchesFilter = filter === 'all' || item.type === filter;
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                           item.description.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'popular') return b.downloads - a.downloads;
      if (sortBy === 'rating') return b.rating - a.rating;
      return 0;
    });

  const toggleInstall = (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, installed: !item.installed } : item
    ));
  };

  const typeIcons = {
    agent: '🤖',
    plugin: '🔌',
    workflow: '⛓',
    theme: '🎨',
  };

  return (
    <div className="marketplace-view">
      <div className="view-header">
        <h2>Marketplace</h2>
        <div className="marketplace-stats">
          <span>{items.filter(i => i.installed).length} installed</span>
        </div>
      </div>

      <div className="marketplace-hero">
        <div className="hero-content">
          <h3>Extend Genesis</h3>
          <p>Discover agents, plugins, and workflows to supercharge your AI system</p>
        </div>
      </div>

      <div className="marketplace-controls">
        <div className="search-box">
          <Icons.search />
          <input
            type="text"
            placeholder="Search marketplace..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {(['all', 'agent', 'plugin', 'workflow', 'theme'] as const).map(type => (
            <button
              key={type}
              className={`filter-tab ${filter === type ? 'active' : ''}`}
              onClick={() => setFilter(type)}
            >
              {type === 'all' ? 'All' : typeIcons[type]} {type !== 'all' && type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
          <option value="popular">Most Popular</option>
          <option value="rating">Highest Rated</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      <div className="marketplace-grid">
        {filteredItems.map(item => (
          <motion.div
            key={item.id}
            className={`marketplace-card ${item.installed ? 'installed' : ''}`}
            whileHover={{ y: -4 }}
          >
            <div className="card-header">
              <span className="type-icon">{typeIcons[item.type]}</span>
              <div className="item-info">
                <h3>
                  {item.name}
                  {item.verified && <span className="verified-badge" title="Verified">✓</span>}
                </h3>
                <span className="author">by {item.author}</span>
              </div>
              <span className="price">
                {item.price === 'free' ? 'Free' : `$${item.price}`}
              </span>
            </div>
            <p className="item-desc">{item.description}</p>
            <div className="item-tags">
              {item.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
            <div className="card-footer">
              <div className="stats">
                <span className="rating">★ {item.rating}</span>
                <span className="downloads">{(item.downloads / 1000).toFixed(1)}k downloads</span>
              </div>
              <button
                className={`install-btn ${item.installed ? 'installed' : ''}`}
                onClick={() => toggleInstall(item.id)}
              >
                {item.installed ? 'Installed ✓' : 'Install'}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MCP HUB - Model Context Protocol Control Center
// ============================================================================

interface MCPServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  icon: string;
  tools: MCPTool[];
  description: string;
  category: 'ai' | 'research' | 'web' | 'cloud' | 'automation';
}

interface MCPTool {
  name: string;
  mcpName?: string; // Real MCP tool name (e.g., mcp__gemini__web_search)
  description: string;
  params?: Record<string, string>; // Parameter descriptions
  parameters?: Record<string, any>;
  template?: string; // Pre-filled input template
}

interface MCPCall {
  id: string;
  server: string;
  tool: string;
  timestamp: number;
  duration: number;
  status: 'success' | 'error' | 'pending';
  input?: any;
  output?: any;
}

interface MCPFavorite {
  serverId: string;
  toolName: string;
}

// 3D MCP Constellation Component
function MCPConstellation3D({ servers, selectedServer, onSelect }: {
  servers: MCPServer[];
  selectedServer: MCPServer | null;
  onSelect: (server: MCPServer) => void;
}) {
  return (
    <div className="mcp-constellation-3d">
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#a855f7" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#06b6d4" />
        <Stars radius={100} depth={50} count={2000} factor={4} fade speed={1} />

        {servers.map((server, i) => {
          const angle = (i / servers.length) * Math.PI * 2;
          const radius = 3;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const y = (Math.random() - 0.5) * 2;

          return (
            <group key={server.id} position={[x, y, z]}>
              <mesh
                onClick={() => onSelect(server)}
                onPointerOver={(e) => (e.object.scale.setScalar(1.3))}
                onPointerOut={(e) => (e.object.scale.setScalar(1))}
              >
                <sphereGeometry args={[0.3 + server.tools.length * 0.02, 32, 32]} />
                <meshStandardMaterial
                  color={server.status === 'connected' ? '#10b981' : '#ef4444'}
                  emissive={selectedServer?.id === server.id ? '#a855f7' : '#000'}
                  emissiveIntensity={selectedServer?.id === server.id ? 0.5 : 0}
                  metalness={0.8}
                  roughness={0.2}
                />
              </mesh>
              {/* Tool particles orbiting */}
              {server.tools.slice(0, 5).map((_, ti) => {
                const toolAngle = (ti / Math.min(5, server.tools.length)) * Math.PI * 2;
                const toolRadius = 0.5;
                return (
                  <mesh
                    key={ti}
                    position={[
                      Math.cos(toolAngle) * toolRadius,
                      Math.sin(toolAngle) * toolRadius,
                      0
                    ]}
                  >
                    <sphereGeometry args={[0.05, 16, 16]} />
                    <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.5} />
                  </mesh>
                );
              })}
            </group>
          );
        })}

        <OrbitControls enableZoom={true} enablePan={false} autoRotate autoRotateSpeed={0.3} />
      </Canvas>

      {/* Legend overlay */}
      <div className="constellation-legend">
        {servers.map(server => (
          <div
            key={server.id}
            className={`legend-item ${selectedServer?.id === server.id ? 'selected' : ''}`}
            onClick={() => onSelect(server)}
          >
            <span className="legend-icon">{server.icon}</span>
            <span className="legend-name">{server.name}</span>
            <span className="legend-count">{server.tools.length}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tool Search Component
function MCPToolSearch({ servers, onSelectTool }: {
  servers: MCPServer[];
  onSelectTool: (server: MCPServer, tool: MCPTool) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTools = useMemo(() => {
    return servers.flatMap(server =>
      server.tools.map(tool => ({ server, tool }))
    );
  }, [servers]);

  const filteredTools = useMemo(() => {
    if (!query) return allTools.slice(0, 10);
    const q = query.toLowerCase();
    return allTools.filter(
      ({ server, tool }) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        server.name.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allTools, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) {
    return (
      <button className="mcp-search-trigger" onClick={() => setIsOpen(true)}>
        <Icons.search />
        <span>Search tools...</span>
        <span className="shortcut">⌘F</span>
      </button>
    );
  }

  return (
    <motion.div
      className="mcp-tool-search"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="search-input-wrapper">
        <Icons.search />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search all MCP tools..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <button className="close-search" onClick={() => setIsOpen(false)}>×</button>
      </div>
      <div className="search-results">
        {filteredTools.map(({ server, tool }, i) => (
          <motion.button
            key={`${server.id}-${tool.name}`}
            className="search-result"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => {
              onSelectTool(server, tool);
              setIsOpen(false);
              setQuery('');
            }}
          >
            <span className="result-icon">{server.icon}</span>
            <div className="result-info">
              <span className="result-name">{tool.name}</span>
              <span className="result-desc">{tool.description}</span>
            </div>
            <span className="result-server">{server.name}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// Activity Sparkline Component
function MCPActivitySparkline({ calls }: { calls: MCPCall[] }) {
  const last24Hours = useMemo(() => {
    const now = Date.now();
    const hours = Array(24).fill(0);
    calls.forEach(call => {
      const hoursAgo = Math.floor((now - call.timestamp) / (1000 * 60 * 60));
      if (hoursAgo < 24) {
        hours[23 - hoursAgo]++;
      }
    });
    return hours;
  }, [calls]);

  const max = Math.max(...last24Hours, 1);

  return (
    <div className="activity-sparkline">
      <div className="sparkline-bars">
        {last24Hours.map((count, i) => (
          <div
            key={i}
            className="sparkline-bar"
            style={{
              height: `${(count / max) * 100}%`,
              opacity: 0.3 + (count / max) * 0.7
            }}
          />
        ))}
      </div>
      <div className="sparkline-label">Last 24h activity</div>
    </div>
  );
}

// Server Detail Popover Component
function ServerDetailPopover({ server, position, onClose }: {
  server: MCPServer;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  return (
    <motion.div
      className="server-popover"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{ left: position.x, top: position.y }}
    >
      <div className="popover-header">
        <span className="popover-icon">{server.icon}</span>
        <div className="popover-title">
          <h4>{server.name}</h4>
          <span className={`popover-status ${server.status}`}>
            {server.status === 'connected' ? '● Online' : '○ Offline'}
          </span>
        </div>
        <button className="popover-close" onClick={onClose}>×</button>
      </div>
      <p className="popover-desc">{server.description}</p>
      <div className="popover-stats">
        <div className="popover-stat">
          <span className="stat-val">{server.tools.length}</span>
          <span className="stat-lbl">Tools</span>
        </div>
        <div className="popover-stat">
          <span className="stat-val">{server.category}</span>
          <span className="stat-lbl">Category</span>
        </div>
      </div>
      <div className="popover-tools">
        <h5>Available Tools</h5>
        <div className="mini-tools-list">
          {server.tools.slice(0, 5).map(tool => (
            <div key={tool.name} className="mini-tool">
              <span className="mini-tool-name">{tool.name}</span>
            </div>
          ))}
          {server.tools.length > 5 && (
            <div className="mini-tool more">+{server.tools.length - 5} more</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Live Execution Indicator Component
function LiveExecutionIndicator({ isExecuting, currentTool, duration }: {
  isExecuting: boolean;
  currentTool: string | null;
  duration: number;
}) {
  if (!isExecuting) return null;

  return (
    <motion.div
      className="live-execution"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      <div className="execution-pulse" />
      <div className="execution-info">
        <span className="execution-tool">{currentTool}</span>
        <span className="execution-duration">{(duration / 1000).toFixed(1)}s</span>
      </div>
      <div className="execution-spinner" />
    </motion.div>
  );
}

// Tool Category Badge Component
function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    ai: '#a855f7',
    research: '#3b82f6',
    web: '#f97316',
    cloud: '#06b6d4',
    automation: '#10b981',
  };

  return (
    <span
      className="category-badge"
      style={{ '--badge-color': colors[category] || '#6b7280' } as React.CSSProperties}
    >
      {category}
    </span>
  );
}

// ============================================================================
// MCP LEARNING & MEMORY SYSTEM
// ============================================================================

interface UsagePattern {
  toolId: string;
  serverId: string;
  useCount: number;
  successRate: number;
  avgDuration: number;
  lastUsed: number;
  commonInputs: string[];
}

interface MCPLearningState {
  patterns: UsagePattern[];
  totalCalls: number;
  successfulCalls: number;
  favoriteTools: string[];
  lastSession: number;
  insights: LearningInsight[];
}

interface LearningInsight {
  id: string;
  type: 'recommendation' | 'optimization' | 'warning' | 'achievement';
  title: string;
  description: string;
  actionTool?: string;
  createdAt: number;
}

const LEARNING_STORAGE_KEY = 'genesis-mcp-learning';

function useMCPLearning(callHistory: MCPCall[]): MCPLearningState {
  const [state, setState] = useState<MCPLearningState>(() => {
    try {
      const saved = localStorage.getItem(LEARNING_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      patterns: [],
      totalCalls: 0,
      successfulCalls: 0,
      favoriteTools: [],
      lastSession: Date.now(),
      insights: [],
    };
  });

  // Update patterns when call history changes
  useEffect(() => {
    const patternMap = new Map<string, UsagePattern>();

    callHistory.forEach(call => {
      const toolId = `${call.server}:${call.tool}`;
      const existing = patternMap.get(toolId) || {
        toolId,
        serverId: call.server,
        useCount: 0,
        successRate: 0,
        avgDuration: 0,
        lastUsed: 0,
        commonInputs: [],
      };

      existing.useCount++;
      existing.lastUsed = Math.max(existing.lastUsed, call.timestamp);
      existing.avgDuration = (existing.avgDuration * (existing.useCount - 1) + call.duration) / existing.useCount;

      if (call.status === 'success') {
        existing.successRate = ((existing.successRate * (existing.useCount - 1)) + 1) / existing.useCount;
      }

      if (call.input && !existing.commonInputs.includes(call.input)) {
        existing.commonInputs = [...existing.commonInputs.slice(-4), call.input];
      }

      patternMap.set(toolId, existing);
    });

    const patterns = Array.from(patternMap.values())
      .sort((a, b) => b.useCount - a.useCount);

    const successfulCalls = callHistory.filter(c => c.status === 'success').length;

    // Generate insights based on patterns
    const insights: LearningInsight[] = [];

    // Top tool insight
    if (patterns.length > 0) {
      const topTool = patterns[0];
      insights.push({
        id: `top-${topTool.toolId}`,
        type: 'achievement',
        title: 'Most Used Tool',
        description: `${topTool.toolId.split(':')[1]} is your go-to tool with ${topTool.useCount} uses`,
        actionTool: topTool.toolId,
        createdAt: Date.now(),
      });
    }

    // Low success rate warning
    const lowSuccessTools = patterns.filter(p => p.useCount >= 3 && p.successRate < 0.5);
    if (lowSuccessTools.length > 0) {
      insights.push({
        id: `warn-${lowSuccessTools[0].toolId}`,
        type: 'warning',
        title: 'Check Parameters',
        description: `${lowSuccessTools[0].toolId.split(':')[1]} has a ${(lowSuccessTools[0].successRate * 100).toFixed(0)}% success rate`,
        actionTool: lowSuccessTools[0].toolId,
        createdAt: Date.now(),
      });
    }

    // Recommend unused categories
    const usedCategories = new Set(patterns.map(p => p.serverId));
    const allCategories = ['gemini', 'context7', 'semantic-scholar', 'arxiv', 'firecrawl', 'playwright', 'aws'];
    const unusedCategories = allCategories.filter(c => !usedCategories.has(c));
    if (unusedCategories.length > 0) {
      insights.push({
        id: `discover-${unusedCategories[0]}`,
        type: 'recommendation',
        title: 'Explore New Tools',
        description: `Try ${unusedCategories[0]} for new capabilities`,
        createdAt: Date.now(),
      });
    }

    const newState: MCPLearningState = {
      patterns,
      totalCalls: callHistory.length,
      successfulCalls,
      favoriteTools: patterns.slice(0, 5).map(p => p.toolId),
      lastSession: Date.now(),
      insights: insights.slice(0, 4),
    };

    setState(newState);
    localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(newState));

    // Also sync to disk via server for persistence across sessions
    fetch('http://localhost:9876/api/learning/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newState),
    }).catch(() => {
      // Silent fail - localStorage is the primary store
    });
  }, [callHistory]);

  // Load from server on mount (fallback for fresh installs)
  useEffect(() => {
    fetch('http://localhost:9876/api/learning/load')
      .then(res => res.json())
      .then(serverState => {
        // Only use server state if local is empty and server has data
        if (serverState.totalCalls > 0) {
          const localState = localStorage.getItem(LEARNING_STORAGE_KEY);
          if (!localState) {
            setState(serverState);
            localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(serverState));
          }
        }
      })
      .catch(() => {
        // Silent fail - use local state
      });
  }, []);

  return state;
}

// MCP Learning Panel Component
function MCPLearningPanel({ learning, onSelectTool }: {
  learning: MCPLearningState;
  onSelectTool: (serverId: string, toolName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const overallSuccessRate = learning.totalCalls > 0
    ? (learning.successfulCalls / learning.totalCalls * 100).toFixed(0)
    : 0;

  return (
    <motion.div
      className={`mcp-learning-panel ${expanded ? 'expanded' : ''}`}
      layout
    >
      <div className="learning-header" onClick={() => setExpanded(!expanded)}>
        <div className="learning-title">
          <span className="learning-icon">🧠</span>
          <span>Learning Insights</span>
        </div>
        <div className="learning-summary">
          <span className="learning-stat">
            <span className="stat-num">{learning.totalCalls}</span>
            <span className="stat-lbl">calls</span>
          </span>
          <span className="learning-stat">
            <span className="stat-num">{overallSuccessRate}%</span>
            <span className="stat-lbl">success</span>
          </span>
        </div>
        <motion.span
          className="expand-icon"
          animate={{ rotate: expanded ? 180 : 0 }}
        >
          ▼
        </motion.span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="learning-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {/* Insights */}
            <div className="insights-section">
              <h4>Insights</h4>
              <div className="insights-grid">
                {learning.insights.map(insight => (
                  <motion.div
                    key={insight.id}
                    className={`insight-card ${insight.type}`}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => {
                      if (insight.actionTool) {
                        const [server, tool] = insight.actionTool.split(':');
                        onSelectTool(server, tool);
                      }
                    }}
                  >
                    <span className="insight-icon">
                      {insight.type === 'achievement' ? '🏆' :
                       insight.type === 'warning' ? '⚠️' :
                       insight.type === 'recommendation' ? '💡' : '✨'}
                    </span>
                    <div className="insight-text">
                      <span className="insight-title">{insight.title}</span>
                      <span className="insight-desc">{insight.description}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Top Tools */}
            <div className="top-tools-section">
              <h4>Most Used Tools</h4>
              <div className="usage-chart">
                {learning.patterns.slice(0, 5).map((pattern, idx) => (
                  <motion.div
                    key={pattern.toolId}
                    className="usage-bar-row"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <span className="usage-rank">#{idx + 1}</span>
                    <span className="usage-tool">{pattern.toolId.split(':')[1]}</span>
                    <div className="usage-bar-container">
                      <motion.div
                        className="usage-bar-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${(pattern.useCount / (learning.patterns[0]?.useCount || 1)) * 100}%` }}
                        transition={{ delay: 0.2 + idx * 0.05, duration: 0.5 }}
                      />
                    </div>
                    <span className="usage-count">{pattern.useCount}</span>
                    <span className={`usage-success ${pattern.successRate >= 0.8 ? 'high' : pattern.successRate >= 0.5 ? 'mid' : 'low'}`}>
                      {(pattern.successRate * 100).toFixed(0)}%
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Usage Heatmap */}
            <div className="heatmap-section">
              <h4>Activity by Category</h4>
              <div className="category-heatmap">
                {['ai', 'research', 'web', 'cloud', 'automation'].map(category => {
                  const categoryPatterns = learning.patterns.filter(p => {
                    const serverCategories: Record<string, string> = {
                      gemini: 'ai',
                      context7: 'research',
                      'semantic-scholar': 'research',
                      arxiv: 'research',
                      firecrawl: 'web',
                      playwright: 'automation',
                      aws: 'cloud',
                    };
                    return serverCategories[p.serverId] === category;
                  });
                  const totalUses = categoryPatterns.reduce((sum, p) => sum + p.useCount, 0);
                  const maxUses = Math.max(...learning.patterns.map(p => p.useCount), 1);
                  const intensity = totalUses / maxUses;

                  return (
                    <div
                      key={category}
                      className="heatmap-cell"
                      style={{
                        '--intensity': intensity,
                        '--cat-hue': category === 'ai' ? 270 :
                                     category === 'research' ? 200 :
                                     category === 'web' ? 30 :
                                     category === 'cloud' ? 180 : 140
                      } as React.CSSProperties}
                    >
                      <span className="heatmap-label">{category}</span>
                      <span className="heatmap-value">{totalUses}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Memory Sync Status */}
            <div className="memory-sync-section">
              <div className="sync-status">
                <span className="sync-icon">💾</span>
                <span className="sync-text">
                  Memory synced • {learning.patterns.length} patterns learned
                </span>
                <span className="sync-time">
                  Last: {new Date(learning.lastSession).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Toast Notification System
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

function ToastContainer({ toasts, onDismiss }: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            onClick={() => onDismiss(toast.id)}
          >
            <span className="toast-icon">
              {toast.type === 'success' ? '✓' :
               toast.type === 'error' ? '✗' :
               toast.type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <div className="toast-content">
              <span className="toast-title">{toast.title}</span>
              {toast.message && <span className="toast-message">{toast.message}</span>}
            </div>
            <button className="toast-close">×</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { ...toast, id }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, toast.duration || 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

// Smart Suggestions Component
function SmartSuggestions({ learning, servers, onSelectTool }: {
  learning: MCPLearningState;
  servers: MCPServer[];
  onSelectTool: (server: MCPServer, tool: MCPTool) => void;
}) {
  // Generate suggestions based on patterns
  const suggestions = useMemo(() => {
    const result: Array<{ server: MCPServer; tool: MCPTool; reason: string; score: number }> = [];

    // Frequently used tools
    learning.patterns.slice(0, 3).forEach(pattern => {
      const server = servers.find(s => s.id === pattern.serverId);
      const tool = server?.tools.find(t => t.name === pattern.toolId.split(':')[1]);
      if (server && tool) {
        result.push({
          server,
          tool,
          reason: 'Frequently used',
          score: pattern.useCount * 10 + pattern.successRate * 5,
        });
      }
    });

    // High success rate tools
    learning.patterns
      .filter(p => p.successRate >= 0.9 && p.useCount >= 2)
      .slice(0, 2)
      .forEach(pattern => {
        const server = servers.find(s => s.id === pattern.serverId);
        const tool = server?.tools.find(t => t.name === pattern.toolId.split(':')[1]);
        if (server && tool && !result.find(r => r.tool.name === tool.name)) {
          result.push({
            server,
            tool,
            reason: 'High success rate',
            score: pattern.successRate * 15,
          });
        }
      });

    return result.sort((a, b) => b.score - a.score).slice(0, 4);
  }, [learning, servers]);

  if (suggestions.length === 0) return null;

  return (
    <div className="smart-suggestions">
      <div className="suggestions-header">
        <span className="suggestions-icon">✨</span>
        <span>Smart Suggestions</span>
      </div>
      <div className="suggestions-list">
        {suggestions.map(({ server, tool, reason }) => (
          <motion.button
            key={`${server.id}-${tool.name}`}
            className="suggestion-chip"
            onClick={() => onSelectTool(server, tool)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="suggestion-server-icon">{server.icon}</span>
            <span className="suggestion-tool">{tool.name}</span>
            <span className="suggestion-reason">{reason}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// Tool Template Generator
function getToolTemplates(serverId: string, toolName: string): { label: string; value: string }[] {
  const templates: Record<string, Record<string, { label: string; value: string }[]>> = {
    gemini: {
      web_search: [
        { label: 'Simple search', value: '{"query": "your search query"}' },
        { label: 'Research mode', value: '{"query": "topic", "mode": "research"}' },
        { label: 'With citations', value: '{"query": "topic", "includeCitations": true}' },
      ],
      web_search_batch: [
        { label: 'Multiple queries', value: '{"queries": ["query1", "query2", "query3"]}' },
      ],
      health_check: [
        { label: 'Check health', value: '{}' },
      ],
    },
    context7: {
      'resolve-library-id': [
        { label: 'React', value: '{"libraryName": "react"}' },
        { label: 'Vue', value: '{"libraryName": "vue"}' },
        { label: 'Next.js', value: '{"libraryName": "nextjs"}' },
      ],
      'query-docs': [
        { label: 'React hooks', value: '{"libraryId": "react", "query": "useState hook"}' },
        { label: 'Getting started', value: '{"libraryId": "react", "query": "getting started"}' },
      ],
    },
    'semantic-scholar': {
      search_semantic_scholar: [
        { label: 'AI search', value: '{"query": "machine learning", "limit": 10}' },
        { label: 'By author', value: '{"author": "author name", "limit": 5}' },
      ],
      get_semantic_scholar_paper: [
        { label: 'By paper ID', value: '{"paperId": "paper-id"}' },
        { label: 'By DOI', value: '{"doi": "10.1234/example"}' },
      ],
    },
    arxiv: {
      search_arxiv: [
        { label: 'AI papers', value: '{"query": "transformer neural network", "max_results": 10}' },
        { label: 'By author', value: '{"query": "au:Vaswani", "max_results": 5}' },
      ],
      get_recent_ai_papers: [
        { label: 'Latest 10', value: '{"max_results": 10}' },
        { label: 'Latest 25', value: '{"max_results": 25}' },
      ],
    },
    firecrawl: {
      firecrawl_scrape: [
        { label: 'Simple scrape', value: '{"url": "https://example.com"}' },
        { label: 'With markdown', value: '{"url": "https://example.com", "formats": ["markdown"]}' },
      ],
      firecrawl_map: [
        { label: 'Map site', value: '{"url": "https://example.com"}' },
      ],
      firecrawl_search: [
        { label: 'Web search', value: '{"query": "search term", "limit": 5}' },
      ],
      firecrawl_crawl: [
        { label: 'Crawl site', value: '{"url": "https://example.com", "limit": 10}' },
      ],
    },
    playwright: {
      browser_navigate: [
        { label: 'Go to URL', value: '{"url": "https://example.com"}' },
      ],
      browser_take_screenshot: [
        { label: 'Full page', value: '{"fullPage": true}' },
        { label: 'Visible only', value: '{"fullPage": false}' },
      ],
      browser_click: [
        { label: 'By selector', value: '{"selector": "button.submit"}' },
        { label: 'By text', value: '{"text": "Submit"}' },
      ],
    },
    aws: {
      cloud_servers: [
        { label: 'List instances', value: '{"action": "list"}' },
        { label: 'By region', value: '{"action": "list", "region": "us-east-1"}' },
      ],
      cloud_storage: [
        { label: 'List buckets', value: '{"action": "list-buckets"}' },
        { label: 'List objects', value: '{"action": "list-objects", "bucket": "my-bucket"}' },
      ],
    },
  };

  return templates[serverId]?.[toolName] || [
    { label: 'Empty', value: '{}' },
    { label: 'Sample', value: '{"param": "value"}' },
  ];
}

function MCPHubView() {
  const [servers, setServers] = useState<MCPServer[]>([
    // AI & Search
    {
      id: 'gemini',
      name: 'Gemini',
      status: 'connected',
      icon: '💎',
      category: 'ai',
      description: 'Grounded web search with citations using Gemini models',
      tools: [
        { name: 'web_search', mcpName: 'mcp__gemini__web_search', description: 'Search web with AI grounding (normal/research mode)', params: { q: 'string (required)', mode: 'normal | research', verbosity: 'concise | normal | detailed' } },
        { name: 'web_search_batch', mcpName: 'mcp__gemini__web_search_batch', description: 'Run multiple searches in parallel', params: { queries: 'string[]' } },
        { name: 'health_check', mcpName: 'mcp__gemini__health_check', description: 'Check Gemini service health and metrics', params: {} },
      ],
    },
    // Research
    {
      id: 'context7',
      name: 'Context7',
      status: 'connected',
      icon: '📚',
      category: 'research',
      description: 'Up-to-date documentation and code examples for any library',
      tools: [
        { name: 'resolve-library-id', mcpName: 'mcp__context7__resolve-library-id', description: 'Resolve library name to Context7 ID', params: { libraryName: 'string (required)', query: 'string (required)' } },
        { name: 'query-docs', mcpName: 'mcp__context7__query-docs', description: 'Query documentation for any library', params: { libraryId: 'string (required)', query: 'string (required)' } },
      ],
    },
    {
      id: 'semantic-scholar',
      name: 'Semantic Scholar',
      status: 'connected',
      icon: '🎓',
      category: 'research',
      description: 'Academic paper search and citation analysis',
      tools: [
        { name: 'search_semantic_scholar', mcpName: 'mcp__semantic-scholar__search_semantic_scholar', description: 'Search papers by keyword/topic', params: { query: 'string (required)', maxResults: 'number (default: 10)' } },
        { name: 'get_semantic_scholar_paper', mcpName: 'mcp__semantic-scholar__get_semantic_scholar_paper', description: 'Get paper by ID or DOI', params: { identifier: 'string (required)' } },
        { name: 'get_paper_citations', mcpName: 'mcp__semantic-scholar__get_paper_citations', description: 'Get citing papers', params: { paperId: 'string (required)' } },
        { name: 'semantic_scholar_to_bibtex', mcpName: 'mcp__semantic-scholar__semantic_scholar_to_bibtex', description: 'Convert to BibTeX format', params: { identifier: 'string (required)' } },
      ],
    },
    {
      id: 'arxiv',
      name: 'ArXiv',
      status: 'connected',
      icon: '📄',
      category: 'research',
      description: 'Search and access research papers from arXiv',
      tools: [
        { name: 'search_arxiv', mcpName: 'mcp__arxiv__search_arxiv', description: 'Search arXiv papers', params: { query: 'string (required)', maxResults: 'number (default: 5)' } },
        { name: 'get_recent_ai_papers', mcpName: 'mcp__arxiv__get_recent_ai_papers', description: 'Get latest AI papers (cs.AI)', params: {} },
        { name: 'get_arxiv_pdf_url', mcpName: 'mcp__arxiv__get_arxiv_pdf_url', description: 'Get paper PDF URL', params: { arxivId: 'string (required)' } },
        { name: 'parse_paper_content', mcpName: 'mcp__arxiv__parse_paper_content', description: 'Parse paper content', params: { arxivId: 'string (required)' } },
      ],
    },
    // Web
    {
      id: 'firecrawl',
      name: 'Firecrawl',
      status: 'connected',
      icon: '🔥',
      category: 'web',
      description: 'Advanced web scraping, crawling, and search',
      tools: [
        { name: 'firecrawl_scrape', mcpName: 'mcp__firecrawl__firecrawl_scrape', description: 'Scrape content from single URL', params: { url: 'string (required)', formats: '["markdown"]' } },
        { name: 'firecrawl_map', mcpName: 'mcp__firecrawl__firecrawl_map', description: 'Discover all URLs on a site', params: { url: 'string (required)' } },
        { name: 'firecrawl_search', mcpName: 'mcp__firecrawl__firecrawl_search', description: 'Search web and extract content', params: { query: 'string (required)', limit: 'number' } },
        { name: 'firecrawl_crawl', mcpName: 'mcp__firecrawl__firecrawl_crawl', description: 'Crawl website and extract content', params: { url: 'string (required)', limit: 'number' } },
        { name: 'firecrawl_check_crawl_status', mcpName: 'mcp__firecrawl__firecrawl_check_crawl_status', description: 'Check crawl job status', params: { id: 'string (required)' } },
        { name: 'firecrawl_extract', mcpName: 'mcp__firecrawl__firecrawl_extract', description: 'Extract structured data', params: { urls: 'string[]', prompt: 'string' } },
        { name: 'firecrawl_agent', mcpName: 'mcp__firecrawl__firecrawl_agent', description: 'Autonomous data gathering agent', params: { prompt: 'string (required)' } },
        { name: 'firecrawl_agent_status', mcpName: 'mcp__firecrawl__firecrawl_agent_status', description: 'Check agent status', params: { id: 'string (required)' } },
      ],
    },
    // Automation
    {
      id: 'playwright',
      name: 'Playwright',
      status: 'connected',
      icon: '🎭',
      category: 'automation',
      description: 'Browser automation, testing, and web interaction',
      tools: [
        { name: 'browser_navigate', description: 'Navigate to URL' },
        { name: 'browser_navigate_back', description: 'Go back in history' },
        { name: 'browser_click', description: 'Click element' },
        { name: 'browser_hover', description: 'Hover over element' },
        { name: 'browser_drag', description: 'Drag and drop' },
        { name: 'browser_type', description: 'Type text in input' },
        { name: 'browser_fill_form', description: 'Fill form fields' },
        { name: 'browser_press_key', description: 'Press keyboard key' },
        { name: 'browser_select_option', description: 'Select dropdown option' },
        { name: 'browser_file_upload', description: 'Upload file' },
        { name: 'browser_take_screenshot', description: 'Take screenshot' },
        { name: 'browser_snapshot', description: 'Get accessibility snapshot' },
        { name: 'browser_evaluate', description: 'Execute JavaScript' },
        { name: 'browser_run_code', description: 'Run Playwright code snippet' },
        { name: 'browser_console_messages', description: 'Get console messages' },
        { name: 'browser_network_requests', description: 'Get network requests' },
        { name: 'browser_tabs', description: 'Manage browser tabs' },
        { name: 'browser_handle_dialog', description: 'Handle alert/confirm/prompt' },
        { name: 'browser_wait_for', description: 'Wait for element/condition' },
        { name: 'browser_resize', description: 'Resize browser window' },
        { name: 'browser_close', description: 'Close browser' },
        { name: 'browser_install', description: 'Install browser' },
      ],
    },
    // Cloud - AWS
    {
      id: 'aws',
      name: 'AWS',
      status: 'connected',
      icon: '☁️',
      category: 'cloud',
      description: 'Amazon Web Services - Complete cloud infrastructure management',
      tools: [
        // Compute
        { name: 'cloud_servers', description: 'EC2 instance management' },
        { name: 'serverless_functions', description: 'Lambda functions' },
        { name: 'container_services', description: 'ECS/Fargate containers' },
        { name: 'kubernetes', description: 'EKS Kubernetes clusters' },
        { name: 'kubernetes_clusters', description: 'Manage EKS clusters' },
        { name: 'kubernetes_packages', description: 'Helm charts' },
        // Storage
        { name: 'cloud_storage', description: 'S3 buckets and objects' },
        { name: 'databases', description: 'RDS/DynamoDB databases' },
        { name: 'database_manager', description: 'Advanced DB management' },
        { name: 'container_registry', description: 'ECR container images' },
        // Networking
        { name: 'network_manager', description: 'VPC and networking' },
        { name: 'route53', description: 'DNS management' },
        { name: 'cloudfront', description: 'CDN distribution' },
        // DevOps
        { name: 'build_jobs', description: 'CodeBuild jobs' },
        { name: 'build_operations', description: 'Build operations' },
        { name: 'deployment_pipelines', description: 'CodePipeline' },
        { name: 'deployment_insights', description: 'Deployment analytics' },
        { name: 'source_control', description: 'CodeCommit repos' },
        { name: 'infrastructure_code', description: 'CloudFormation/CDK' },
        { name: 'cloud_templates', description: 'CF templates' },
        // Monitoring & Logs
        { name: 'logs_and_metrics', description: 'CloudWatch logs/metrics' },
        { name: 'smart_log_analysis', description: 'AI-powered log analysis' },
        { name: 'dashboards', description: 'CloudWatch dashboards' },
        // Security
        { name: 'security_permissions', description: 'IAM management' },
        { name: 'security_scanner', description: 'Security scanning' },
        { name: 'secrets_manager', description: 'Secrets management' },
        // Operations
        { name: 'incident_manager', description: 'Incident management' },
        { name: 'incident_analyze', description: 'AI incident analysis' },
        { name: 'incident_approve', description: 'Approve recovery actions' },
        { name: 'incident_execute', description: 'Execute recovery' },
        { name: 'incident_recover', description: 'Auto recovery' },
        { name: 'automation_playbooks', description: 'SSM automation' },
        { name: 'runbook', description: 'Runbook execution' },
        { name: 'remote_commands', description: 'SSM Run Command' },
        { name: 'task_scheduler', description: 'EventBridge scheduler' },
        { name: 'scheduled_ops', description: 'Scheduled operations' },
        { name: 'auto_remediation', description: 'Auto-remediation rules' },
        // Messaging
        { name: 'message_queues', description: 'SQS/SNS messaging' },
        { name: 'notifications', description: 'SNS notifications' },
        { name: 'slack_webhook', description: 'Slack integration' },
        { name: 'teams_webhook', description: 'Teams integration' },
        // Multi-account
        { name: 'multi_account', description: 'AWS Organizations' },
        { name: 'multi_region', description: 'Multi-region ops' },
        { name: 'resource_organizer', description: 'Resource Groups' },
        { name: 'cost_optimizer', description: 'Cost optimization' },
        // External
        { name: 'jira_tickets', description: 'Jira integration' },
        { name: 'workflow', description: 'Step Functions' },
        { name: 'ai_assistant', description: 'AI-powered assistant' },
        // Azure DevOps
        { name: 'azure_devops_projects', description: 'Azure DevOps projects' },
        { name: 'azure_devops_pipelines', description: 'Azure pipelines' },
        { name: 'azure_devops_repos', description: 'Azure repos' },
        { name: 'azure_devops_work_items', description: 'Azure work items' },
        { name: 'azure_devops_wiki', description: 'Azure wiki' },
      ],
    },
  ]);

  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [toolInput, setToolInput] = useState('');
  const [toolOutput, setToolOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [view3D, setView3D] = useState(false);
  const [favorites, setFavorites] = useState<MCPFavorite[]>([
    { serverId: 'gemini', toolName: 'web_search' },
    { serverId: 'firecrawl', toolName: 'firecrawl_scrape' },
    { serverId: 'context7', toolName: 'query-docs' },
  ]);

  const [callHistory, setCallHistory] = useState<MCPCall[]>(() => {
    // Load from localStorage
    try {
      const saved = localStorage.getItem('genesis-mcp-history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: '1', server: 'context7', tool: 'query-docs', timestamp: Date.now() - 60000, duration: 1234, status: 'success' },
      { id: '2', server: 'firecrawl', tool: 'firecrawl_scrape', timestamp: Date.now() - 120000, duration: 2456, status: 'success' },
      { id: '3', server: 'gemini', tool: 'web_search', timestamp: Date.now() - 180000, duration: 3200, status: 'success' },
      { id: '4', server: 'semantic-scholar', tool: 'search_semantic_scholar', timestamp: Date.now() - 240000, duration: 890, status: 'error' },
      { id: '5', server: 'arxiv', tool: 'get_recent_ai_papers', timestamp: Date.now() - 300000, duration: 1567, status: 'success' },
      { id: '6', server: 'playwright', tool: 'browser_navigate', timestamp: Date.now() - 360000, duration: 2890, status: 'success' },
      { id: '7', server: 'aws', tool: 'cloud_servers', timestamp: Date.now() - 420000, duration: 1123, status: 'success' },
      { id: '8', server: 'firecrawl', tool: 'firecrawl_agent', timestamp: Date.now() - 480000, duration: 4567, status: 'success' },
    ];
  });

  // Persist call history
  useEffect(() => {
    localStorage.setItem('genesis-mcp-history', JSON.stringify(callHistory.slice(0, 100)));
  }, [callHistory]);

  // Learning system
  const learning = useMCPLearning(callHistory);

  // Toast notifications
  const { toasts, addToast, dismissToast } = useToasts();

  const [filter, setFilter] = useState<'all' | 'ai' | 'research' | 'web' | 'cloud' | 'automation'>('all');

  const isFavorite = (serverId: string, toolName: string) =>
    favorites.some(f => f.serverId === serverId && f.toolName === toolName);

  const toggleFavorite = (serverId: string, toolName: string) => {
    if (isFavorite(serverId, toolName)) {
      setFavorites(prev => prev.filter(f => !(f.serverId === serverId && f.toolName === toolName)));
    } else {
      setFavorites(prev => [...prev, { serverId, toolName }]);
    }
  };

  const handleSelectTool = (server: MCPServer, tool: MCPTool) => {
    setSelectedServer(server);
    setSelectedTool(tool);
    setToolOutput(null);
    // Set template if available
    if (tool.template) {
      setToolInput(tool.template);
    }
  };

  // Computed values
  const filteredServers = useMemo(() =>
    servers.filter(s => filter === 'all' || s.category === filter),
    [servers, filter]
  );

  const totalTools = servers.reduce((acc, s) => acc + s.tools.length, 0);
  const connectedServers = servers.filter(s => s.status === 'connected').length;

  // Keyboard shortcuts for MCP Hub
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelectedTool(null);
        setToolOutput(null);
      }

      // Number keys 1-7 to select servers
      if (e.key >= '1' && e.key <= '7' && !e.metaKey && !e.ctrlKey) {
        const index = parseInt(e.key) - 1;
        const server = filteredServers[index];
        if (server) {
          setSelectedServer(server);
          setSelectedTool(null);
        }
      }

      // G key to toggle 3D view
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        setView3D(v => !v);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredServers]);

  const executeTool = async () => {
    if (!selectedServer || !selectedTool) return;

    setIsExecuting(true);
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Build the MCP request
    const mcpRequest = {
      id: requestId,
      tool: selectedTool.mcpName || `mcp__${selectedServer.id}__${selectedTool.name}`,
      params: (() => {
        try { return JSON.parse(toolInput); } catch { return {}; }
      })(),
      timestamp: Date.now(),
    };

    try {
      // Write request to the MCP bridge endpoint
      const response = await fetch('http://localhost:9876/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcpRequest),
      });

      if (response.ok) {
        const result = await response.json();

        const newCall: MCPCall = {
          id: requestId,
          server: selectedServer.id,
          tool: selectedTool.name,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          status: result.success ? 'success' : 'error',
          input: toolInput,
          output: result.data,
        };

        setCallHistory(prev => [newCall, ...prev]);
        setToolOutput(JSON.stringify(result, null, 2));

        // Show success toast
        addToast({
          type: 'success',
          title: `${selectedTool.name} executed`,
          message: `Completed in ${Date.now() - startTime}ms`,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      // Fallback: Write to file for manual execution
      const fallbackOutput = {
        mode: 'pending_execution',
        tool: mcpRequest.tool,
        params: mcpRequest.params,
        command: `// Execute in Claude Code:\n// ${mcpRequest.tool}(${JSON.stringify(mcpRequest.params)})`,
        note: 'MCP bridge not available. Copy the command above to execute in Claude Code.',
      };

      const newCall: MCPCall = {
        id: requestId,
        server: selectedServer.id,
        tool: selectedTool.name,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        status: 'pending',
        input: toolInput,
        output: fallbackOutput,
      };

      setCallHistory(prev => [newCall, ...prev]);
      setToolOutput(JSON.stringify(fallbackOutput, null, 2));

      // Show info toast for pending execution
      addToast({
        type: 'info',
        title: 'Queued for execution',
        message: 'Use Claude Code to complete this request',
      });
    }

    setIsExecuting(false);
  };

  const categoryColors: Record<string, string> = {
    ai: '#a855f7',
    research: '#06b6d4',
    web: '#f59e0b',
    cloud: '#3b82f6',
    automation: '#10b981',
  };

  // Handler for learning panel tool selection
  const handleLearningToolSelect = (serverId: string, toolName: string) => {
    const server = servers.find(s => s.id === serverId);
    const tool = server?.tools.find(t => t.name === toolName);
    if (server && tool) {
      handleSelectTool(server, tool);
    }
  };

  return (
    <div className="mcp-hub-view">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Server Health Banner */}
      <div className="mcp-health-banner">
        <div className="health-status-grid">
          {servers.map(server => (
            <div
              key={server.id}
              className={`health-dot ${server.status}`}
              title={`${server.name}: ${server.status}`}
            >
              {server.icon}
            </div>
          ))}
        </div>
        <span className="health-summary">
          {connectedServers}/{servers.length} servers online
        </span>
        <div className="health-indicator">
          {connectedServers === servers.length ? (
            <span className="all-healthy">● All Systems Operational</span>
          ) : (
            <span className="some-issues">◐ Some Issues Detected</span>
          )}
        </div>
      </div>

      {/* Learning Panel */}
      <MCPLearningPanel
        learning={learning}
        onSelectTool={handleLearningToolSelect}
      />

      {/* Smart Suggestions */}
      <SmartSuggestions
        learning={learning}
        servers={servers}
        onSelectTool={handleSelectTool}
      />

      <div className="view-header">
        <h2>MCP Hub</h2>
        <div className="mcp-header-actions">
          <MCPToolSearch servers={servers} onSelectTool={handleSelectTool} />
          <button
            className={`view-toggle ${view3D ? 'active' : ''}`}
            onClick={() => setView3D(!view3D)}
            title="Toggle 3D View"
          >
            {view3D ? '2D' : '3D'}
          </button>
        </div>
        <div className="mcp-stats">
          <span className="stat">
            <span className="stat-value">{connectedServers}</span>
            <span className="stat-label">Servers</span>
          </span>
          <span className="stat">
            <span className="stat-value">{totalTools}</span>
            <span className="stat-label">Tools</span>
          </span>
          <span className="stat">
            <span className="stat-value">{callHistory.length}</span>
            <span className="stat-label">Calls</span>
          </span>
          <MCPActivitySparkline calls={callHistory} />
        </div>
      </div>

      {/* Favorites Bar */}
      {favorites.length > 0 && (
        <div className="mcp-favorites-bar">
          <span className="favorites-label">⭐ Favorites</span>
          <div className="favorites-list">
            {favorites.map(fav => {
              const server = servers.find(s => s.id === fav.serverId);
              const tool = server?.tools.find(t => t.name === fav.toolName);
              if (!server || !tool) return null;
              return (
                <motion.button
                  key={`${fav.serverId}-${fav.toolName}`}
                  className="favorite-chip"
                  onClick={() => handleSelectTool(server, tool)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="fav-icon">{server.icon}</span>
                  <span className="fav-name">{tool.name}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* MCP Constellation */}
      {view3D ? (
        <MCPConstellation3D
          servers={filteredServers}
          selectedServer={selectedServer}
          onSelect={(server) => {
            setSelectedServer(server);
            setSelectedTool(null);
            setToolOutput(null);
          }}
        />
      ) : (
      <div className="mcp-constellation">
        <div className="constellation-header">
          <h3>Server Constellation</h3>
          <div className="constellation-filters">
            {(['all', 'ai', 'research', 'web', 'cloud', 'automation'] as const).map(cat => (
              <button
                key={cat}
                className={`filter-btn ${filter === cat ? 'active' : ''}`}
                onClick={() => setFilter(cat)}
                style={cat !== 'all' ? { '--cat-color': categoryColors[cat] } as React.CSSProperties : {}}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="constellation-grid">
          {filteredServers.map(server => (
            <motion.div
              key={server.id}
              className={`server-node ${server.status} ${selectedServer?.id === server.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedServer(server);
                setSelectedTool(null);
                setToolOutput(null);
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{ '--server-color': categoryColors[server.category] } as React.CSSProperties}
            >
              <div className="server-icon">{server.icon}</div>
              <div className="server-info">
                <span className="server-name">{server.name}</span>
                <span className="server-tools">{server.tools.length} tools</span>
              </div>
              <div className={`server-status ${server.status}`} />
            </motion.div>
          ))}
        </div>
      </div>
      )}

      <div className="mcp-workspace">
        {/* Tools Panel */}
        <div className="mcp-tools-panel">
          <h3>
            {selectedServer ? (
              <>
                <span className="server-icon-small">{selectedServer.icon}</span>
                {selectedServer.name} Tools
              </>
            ) : (
              'Select a Server'
            )}
          </h3>
          {selectedServer ? (
            <div className="tools-list">
              {selectedServer.tools.map(tool => (
                <motion.div
                  key={tool.name}
                  className={`tool-item ${selectedTool?.name === tool.name ? 'selected' : ''} ${isFavorite(selectedServer.id, tool.name) ? 'favorited' : ''}`}
                  whileHover={{ x: 4 }}
                >
                  <button
                    className="tool-main"
                    onClick={() => {
                      setSelectedTool(tool);
                      setToolOutput(null);
                    }}
                  >
                    <span className="tool-icon">🔧</span>
                    <div className="tool-info">
                      <span className="tool-name">{tool.name}</span>
                      <span className="tool-desc">{tool.description}</span>
                    </div>
                  </button>
                  <button
                    className={`tool-fav-btn ${isFavorite(selectedServer.id, tool.name) ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(selectedServer.id, tool.name);
                    }}
                    title={isFavorite(selectedServer.id, tool.name) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorite(selectedServer.id, tool.name) ? '★' : '☆'}
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="no-server-selected">
              <span className="empty-icon">🔗</span>
              <p>Click on a server to view its tools</p>
            </div>
          )}
        </div>

        {/* Tool Executor */}
        <div className="mcp-executor">
          {selectedTool ? (
            <>
              <div className="executor-header">
                <h3>{selectedTool.name}</h3>
                <div className="executor-meta">
                  <span className="executor-server">{selectedServer?.name}</span>
                  {selectedServer && <CategoryBadge category={selectedServer.category} />}
                </div>
              </div>
              {/* MCP Tool Name */}
              <div className="mcp-tool-identifier">
                <span className="mcp-label">MCP Tool:</span>
                <code className="mcp-name">{selectedTool.mcpName || `mcp__${selectedServer?.id}__${selectedTool.name}`}</code>
                <button
                  className="copy-mcp-btn"
                  onClick={() => navigator.clipboard.writeText(selectedTool.mcpName || `mcp__${selectedServer?.id}__${selectedTool.name}`)}
                  title="Copy MCP name"
                >
                  📋
                </button>
              </div>
              {/* Bridge Status */}
              <div className="bridge-status">
                <span className="bridge-dot active" />
                <span className="bridge-text">Claude Code Bridge Active</span>
              </div>
              <p className="executor-desc">{selectedTool.description}</p>
              {/* Parameters Schema */}
              {selectedTool.params && Object.keys(selectedTool.params).length > 0 && (
                <div className="params-schema">
                  <span className="params-label">Parameters:</span>
                  <div className="params-list">
                    {Object.entries(selectedTool.params).map(([key, type]) => (
                      <span key={key} className="param-item">
                        <code>{key}</code>: <span className="param-type">{type}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="executor-templates">
                <span className="templates-label">Quick templates:</span>
                <div className="templates-list">
                  {getToolTemplates(selectedServer?.id || '', selectedTool.name).map((template, i) => (
                    <button
                      key={i}
                      className="template-btn"
                      onClick={() => setToolInput(template.value)}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="executor-input">
                <label>Input (JSON)</label>
                <textarea
                  value={toolInput}
                  onChange={e => setToolInput(e.target.value)}
                  placeholder='{"query": "your input here"}'
                  spellCheck={false}
                />
                <div className="input-actions">
                  <button className="input-action" onClick={() => setToolInput('')} title="Clear">
                    🗑️
                  </button>
                  <button
                    className="input-action"
                    onClick={() => {
                      try {
                        const formatted = JSON.stringify(JSON.parse(toolInput), null, 2);
                        setToolInput(formatted);
                      } catch {}
                    }}
                    title="Format JSON"
                  >
                    ✨
                  </button>
                  <button
                    className="input-action"
                    onClick={() => navigator.clipboard.writeText(toolInput)}
                    title="Copy"
                  >
                    📋
                  </button>
                </div>
              </div>
              <button
                className="execute-btn"
                onClick={executeTool}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <>
                    <span className="spinner" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Icons.play />
                    Execute Tool
                  </>
                )}
              </button>
              {toolOutput && (
                <div className="executor-output">
                  <label>Output</label>
                  <pre>{toolOutput}</pre>
                </div>
              )}
            </>
          ) : (
            <div className="no-tool-selected">
              <span className="empty-icon">🔧</span>
              <p>Select a tool to execute</p>
            </div>
          )}
        </div>

        {/* Call History */}
        <div className="mcp-history">
          <h3>Recent Calls</h3>
          <div className="history-list">
            {callHistory.slice(0, 10).map(call => (
              <motion.div
                key={call.id}
                className={`history-item ${call.status}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div className="history-icon">
                  {servers.find(s => s.id === call.server)?.icon || '🔗'}
                </div>
                <div className="history-info">
                  <span className="history-tool">{call.tool}</span>
                  <span className="history-server">{call.server}</span>
                </div>
                <div className="history-meta">
                  <span className="history-duration">{call.duration}ms</span>
                  <span className="history-time">
                    {Math.floor((Date.now() - call.timestamp) / 60000)}m ago
                  </span>
                </div>
                <div className={`history-status ${call.status}`}>
                  {call.status === 'success' ? '✓' : call.status === 'error' ? '✗' : '○'}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mcp-quick-actions">
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'context7') || null);
            setSelectedTool({ name: 'query-docs', description: 'Query documentation' });
          }}
        >
          <span className="qa-icon">📚</span>
          <span className="qa-title">Search Docs</span>
          <span className="qa-desc">Query library documentation</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'gemini') || null);
            setSelectedTool({ name: 'web_search', description: 'Web search with AI' });
          }}
        >
          <span className="qa-icon">💎</span>
          <span className="qa-title">Gemini Search</span>
          <span className="qa-desc">AI-grounded web search</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'semantic-scholar') || null);
            setSelectedTool({ name: 'search_semantic_scholar', description: 'Search papers' });
          }}
        >
          <span className="qa-icon">🎓</span>
          <span className="qa-title">Find Papers</span>
          <span className="qa-desc">Search academic research</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'arxiv') || null);
            setSelectedTool({ name: 'get_recent_ai_papers', description: 'Latest AI papers' });
          }}
        >
          <span className="qa-icon">📄</span>
          <span className="qa-title">ArXiv AI</span>
          <span className="qa-desc">Latest AI research papers</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'firecrawl') || null);
            setSelectedTool({ name: 'firecrawl_scrape', description: 'Scrape URL' });
          }}
        >
          <span className="qa-icon">🔥</span>
          <span className="qa-title">Scrape URL</span>
          <span className="qa-desc">Extract content from page</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'firecrawl') || null);
            setSelectedTool({ name: 'firecrawl_agent', description: 'Autonomous agent' });
          }}
        >
          <span className="qa-icon">🤖</span>
          <span className="qa-title">Web Agent</span>
          <span className="qa-desc">Autonomous data gathering</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'playwright') || null);
            setSelectedTool({ name: 'browser_navigate', description: 'Navigate browser' });
          }}
        >
          <span className="qa-icon">🎭</span>
          <span className="qa-title">Browser</span>
          <span className="qa-desc">Playwright automation</span>
        </motion.button>
        <motion.button
          className="quick-action-card"
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedServer(servers.find(s => s.id === 'aws') || null);
            setSelectedTool({ name: 'cloud_servers', description: 'EC2 management' });
          }}
        >
          <span className="qa-icon">☁️</span>
          <span className="qa-title">AWS Cloud</span>
          <span className="qa-desc">Manage cloud infrastructure</span>
        </motion.button>
      </div>

      {/* Keyboard Shortcuts Hint */}
      <div className="mcp-shortcuts-bar">
        <span className="shortcuts-label">Shortcuts:</span>
        <div className="shortcuts-list">
          <span className="shortcut-item">
            <kbd>⌘F</kbd> Search Tools
          </span>
          <span className="shortcut-item">
            <kbd>⌘↵</kbd> Execute
          </span>
          <span className="shortcut-item">
            <kbd>G</kbd> Toggle 3D
          </span>
          <span className="shortcut-item">
            <kbd>1-7</kbd> Select Server
          </span>
          <span className="shortcut-item">
            <kbd>Esc</kbd> Clear
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONSCIOUSNESS CONTROL CENTER (Genesis Unique)
// ============================================================================

function PhiGauge({ value, size = 160 }: { value: number; size?: number }) {
  const circumference = (size - 20) * Math.PI;
  const strokeDashoffset = circumference - (value * circumference);
  const color = value > 0.7 ? '#22c55e' : value > 0.4 ? '#eab308' : '#ef4444';

  return (
    <div className="phi-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 20) / 2}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 20) / 2}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
        {/* Glow effect */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - 20) / 2}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: 'blur(8px)', opacity: 0.5 }}
        />
      </svg>
      <div className="phi-gauge-center">
        <span className="phi-symbol">φ</span>
        <span className="phi-value">{value.toFixed(3)}</span>
      </div>
    </div>
  );
}

function ConsciousnessControlCenter() {
  const { consciousness, connected } = useGenesisStore();
  const [phiHistory, setPhiHistory] = useState<number[]>([]);

  useEffect(() => {
    setPhiHistory(prev => [...prev.slice(-59), consciousness.phi]);
  }, [consciousness.phi]);

  const stateColors: Record<string, string> = {
    alert: '#22c55e',
    aware: '#3b82f6',
    drowsy: '#eab308',
    dormant: '#71717a',
    fragmented: '#ef4444',
  };

  return (
    <div className="consciousness-view">
      <div className="view-header glass">
        <h2>Consciousness Control Center</h2>
        <div className="header-badges">
          <span className="state-badge" style={{ background: stateColors[consciousness.state] || '#71717a' }}>
            {consciousness.state?.toUpperCase()}
          </span>
          <span className={`connection-badge ${connected ? 'connected' : ''}`}>
            {connected ? '● LIVE' : '○ OFFLINE'}
          </span>
        </div>
      </div>

      <div className="consciousness-grid">
        {/* Main φ Display */}
        <div className="consciousness-card phi-card glass">
          <PhiGauge value={consciousness.phi} size={200} />
          <div className="phi-meta">
            <div className="phi-label">Integrated Information</div>
            <div className="phi-description">
              IIT 4.0 φ measures the irreducible information generated by the system
            </div>
          </div>
        </div>

        {/* φ Trend */}
        <div className="consciousness-card trend-card glass">
          <h3>φ Temporal Dynamics</h3>
          <div className="phi-trend">
            {phiHistory.map((phi, i) => (
              <div
                key={i}
                className="trend-bar"
                style={{
                  height: `${phi * 100}%`,
                  background: `linear-gradient(to top, rgba(168, 85, 247, 0.3), rgba(168, 85, 247, ${0.3 + phi * 0.7}))`,
                  opacity: 0.3 + (i / phiHistory.length) * 0.7,
                }}
              />
            ))}
          </div>
          <div className="trend-labels">
            <span>-60s</span>
            <span>NOW</span>
          </div>
        </div>

        {/* Integration Metrics */}
        <div className="consciousness-card metrics-card glass">
          <h3>Integration Metrics</h3>
          <div className="integration-metrics">
            <div className="metric-row">
              <span className="metric-label">Integration Coherence</span>
              <div className="metric-bar">
                <motion.div
                  className="metric-fill"
                  style={{ background: 'var(--accent-purple)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${consciousness.integration * 100}%` }}
                />
              </div>
              <span className="metric-value">{(consciousness.integration * 100).toFixed(0)}%</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">System Complexity</span>
              <div className="metric-bar">
                <motion.div
                  className="metric-fill"
                  style={{ background: 'var(--accent-cyan)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${consciousness.complexity * 100}%` }}
                />
              </div>
              <span className="metric-value">{(consciousness.complexity * 100).toFixed(0)}%</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Workspace Coherence</span>
              <div className="metric-bar">
                <motion.div
                  className="metric-fill"
                  style={{ background: 'var(--accent-green)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(consciousness.phi * 0.8 + 0.2) * 100}%` }}
                />
              </div>
              <span className="metric-value">{((consciousness.phi * 0.8 + 0.2) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Global Workspace */}
        <div className="consciousness-card workspace-card glass">
          <h3>Global Workspace</h3>
          <div className="workspace-viz">
            {[...Array(7)].map((_, i) => (
              <motion.div
                key={i}
                className="workspace-slot"
                animate={{
                  opacity: Math.random() > 0.3 ? 0.9 : 0.2,
                  scale: Math.random() > 0.5 ? 1 : 0.8,
                }}
                transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse', delay: i * 0.2 }}
              >
                <div className="slot-content" style={{
                  background: `hsl(${260 + i * 15}, 70%, ${40 + Math.random() * 20}%)`,
                }} />
              </motion.div>
            ))}
          </div>
          <div className="workspace-info">
            <span>Capacity: 7±2 items</span>
            <span>Broadcast: ~40Hz</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NEUROMODULATION DASHBOARD (Genesis Unique)
// ============================================================================

function NeuromodulationDashboard() {
  const { neuromod } = useGenesisStore();

  const channels = [
    { name: 'Dopamine', key: 'dopamine', color: '#22c55e', icon: '🧬', effect: 'Exploration & Reward' },
    { name: 'Serotonin', key: 'serotonin', color: '#3b82f6', icon: '💙', effect: 'Patience & Wellbeing' },
    { name: 'Norepinephrine', key: 'norepinephrine', color: '#eab308', icon: '⚡', effect: 'Alertness & Precision' },
    { name: 'Cortisol', key: 'cortisol', color: '#ef4444', icon: '🔥', effect: 'Stress Response' },
  ];

  return (
    <div className="neuromod-view">
      <div className="view-header glass">
        <h2>Neuromodulation System</h2>
        <span className="subtitle">Chemical State Modulation</span>
      </div>

      {/* Aurora Visualization */}
      <div className="neuromod-aurora glass">
        <div className="aurora-container">
          {channels.map((channel, i) => (
            <motion.div
              key={channel.key}
              className="aurora-band"
              style={{
                background: `linear-gradient(90deg,
                  transparent 0%,
                  ${channel.color}40 ${20 + i * 5}%,
                  ${channel.color}80 50%,
                  ${channel.color}40 ${80 - i * 5}%,
                  transparent 100%
                )`,
                height: `${((neuromod as any)[channel.key] || 0.5) * 60 + 20}px`,
              }}
              animate={{
                opacity: [0.5, 0.8, 0.5],
                y: [0, -5, 0],
              }}
              transition={{
                duration: 3 + i,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>

      {/* Channel Cards */}
      <div className="neuromod-channels">
        {channels.map(channel => {
          const value = (neuromod as any)[channel.key] || 0.5;
          return (
            <motion.div
              key={channel.key}
              className="channel-card glass"
              whileHover={{ y: -4 }}
            >
              <div className="channel-header">
                <span className="channel-icon">{channel.icon}</span>
                <span className="channel-name">{channel.name}</span>
              </div>
              <div className="channel-gauge">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke={channel.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={251}
                    strokeDashoffset={251 - (value * 251)}
                    transform="rotate(-90 50 50)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                  />
                </svg>
                <div className="gauge-value">
                  {(value * 100).toFixed(0)}%
                </div>
              </div>
              <div className="channel-effect">{channel.effect}</div>
              <div className="channel-bar">
                <motion.div
                  className="bar-fill"
                  style={{ background: channel.color }}
                  animate={{ width: `${value * 100}%` }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Modulation Effects */}
      <div className="neuromod-effects glass">
        <h3>Active Modulation Effects</h3>
        <div className="effects-grid">
          <div className="effect-item">
            <span className="effect-label">Exploration Rate</span>
            <span className="effect-value" style={{ color: '#22c55e' }}>
              ×{(1 + (neuromod.dopamine || 0.5) * 0.5).toFixed(2)}
            </span>
          </div>
          <div className="effect-item">
            <span className="effect-label">Temporal Discount</span>
            <span className="effect-value" style={{ color: '#3b82f6' }}>
              {((neuromod.serotonin || 0.5) * 0.9 + 0.1).toFixed(2)}
            </span>
          </div>
          <div className="effect-item">
            <span className="effect-label">Precision Gain</span>
            <span className="effect-value" style={{ color: '#eab308' }}>
              ×{(1 + (neuromod.norepinephrine || 0.5) * 0.3).toFixed(2)}
            </span>
          </div>
          <div className="effect-item">
            <span className="effect-label">Risk Tolerance</span>
            <span className="effect-value" style={{ color: '#ef4444' }}>
              {(1 - (neuromod.cortisol || 0.3) * 0.5).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NESS ECONOMIC DASHBOARD (Genesis Unique)
// ============================================================================

function NESSEconomicDashboard() {
  const { economy } = useGenesisStore();

  const runway = economy.runway || 90;
  const nessDeviation = economy.ness || 0.85;

  return (
    <div className="ness-view">
      <div className="view-header glass">
        <h2>NESS Economic Monitor</h2>
        <span className="subtitle">Non-Equilibrium Steady State</span>
      </div>

      <div className="ness-grid">
        {/* NESS Gauge */}
        <div className="ness-card ness-gauge-card glass">
          <h3>NESS Deviation</h3>
          <div className="ness-gauge">
            <svg width="200" height="120" viewBox="0 0 200 120">
              {/* Background arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              {/* Value arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke={nessDeviation > 0.8 ? '#22c55e' : nessDeviation > 0.5 ? '#eab308' : '#ef4444'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="251"
                strokeDashoffset={251 - (nessDeviation * 251)}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="ness-value">
              <span className="value">{(nessDeviation * 100).toFixed(0)}%</span>
              <span className="label">Equilibrium</span>
            </div>
          </div>
          <div className="ness-indicators">
            <div className="indicator">
              <span className="dot" style={{ background: '#22c55e' }} />
              <span>Stable (80%+)</span>
            </div>
            <div className="indicator">
              <span className="dot" style={{ background: '#eab308' }} />
              <span>Warning (50-80%)</span>
            </div>
            <div className="indicator">
              <span className="dot" style={{ background: '#ef4444' }} />
              <span>Critical (&lt;50%)</span>
            </div>
          </div>
        </div>

        {/* Runway */}
        <div className="ness-card runway-card glass">
          <h3>Cash Runway</h3>
          <div className="runway-display">
            <motion.span
              className="runway-days"
              key={runway}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              {runway}
            </motion.span>
            <span className="runway-label">days</span>
          </div>
          <div className="runway-bar">
            <motion.div
              className="runway-fill"
              animate={{ width: `${Math.min(100, (runway / 365) * 100)}%` }}
              style={{
                background: runway > 180 ? '#22c55e' : runway > 90 ? '#eab308' : '#ef4444',
              }}
            />
          </div>
          <div className="runway-meta">
            <span>Balance: ${(economy.cash || 0).toFixed(2)}</span>
            <span>Burn: ${(economy.costs || 0).toFixed(2)}/day</span>
          </div>
        </div>

        {/* Revenue Streams */}
        <div className="ness-card revenue-card glass">
          <h3>Revenue Streams</h3>
          <div className="revenue-streams">
            {[
              { name: 'Bounty', value: 0.35, color: '#a855f7' },
              { name: 'MCP Services', value: 0.25, color: '#3b82f6' },
              { name: 'Content', value: 0.20, color: '#22c55e' },
              { name: 'DeFi Yield', value: 0.12, color: '#eab308' },
              { name: 'Keeper', value: 0.08, color: '#ec4899' },
            ].map(stream => (
              <div key={stream.name} className="stream-row">
                <span className="stream-name">{stream.name}</span>
                <div className="stream-bar">
                  <motion.div
                    className="stream-fill"
                    style={{ background: stream.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${stream.value * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span className="stream-value">{(stream.value * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Q/Γ Ratio */}
        <div className="ness-card ratio-card glass">
          <h3>Q/Γ Dynamics</h3>
          <div className="ratio-display">
            <div className="ratio-item">
              <span className="ratio-label">Solenoidal (Q)</span>
              <span className="ratio-value" style={{ color: '#a855f7' }}>0.52</span>
              <span className="ratio-desc">Exploration</span>
            </div>
            <div className="ratio-divider">/</div>
            <div className="ratio-item">
              <span className="ratio-label">Dissipative (Γ)</span>
              <span className="ratio-value" style={{ color: '#22c55e' }}>0.48</span>
              <span className="ratio-desc">Exploitation</span>
            </div>
          </div>
          <div className="ratio-bar">
            <div className="ratio-left" style={{ width: '52%', background: 'linear-gradient(90deg, #a855f7, #3b82f6)' }} />
            <div className="ratio-right" style={{ width: '48%', background: 'linear-gradient(90deg, #22c55e, #10b981)' }} />
          </div>
          <div className="ratio-target">Target: Q/Γ ≈ 1.0 at NESS</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// OVERVIEW (Dashboard)
// ============================================================================

function OverviewView() {
  const {
    connected,
    consciousness,
    neuromod,
    kernel,
    economy,
    memory,
    agents,
    events,
  } = useGenesisStore();

  return (
    <div className="overview-view">
      <div className="view-header">
        <h2>Overview</h2>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connesso' : '○ Disconnesso'}
        </div>
      </div>

      <div className="overview-grid">
        {/* Consciousness Card */}
        <div className="overview-card consciousness">
          <div className="card-header">
            <h3>Coscienza</h3>
            <span className="state-badge">{consciousness.state}</span>
          </div>
          <div className="phi-display">
            <span className="phi-symbol">φ</span>
            <span className="phi-value">{consciousness.phi.toFixed(3)}</span>
          </div>
          <div className="mini-stats">
            <div className="mini-stat">
              <span className="label">Integrazione</span>
              <span className="value">{(consciousness.integration * 100).toFixed(0)}%</span>
            </div>
            <div className="mini-stat">
              <span className="label">Complessità</span>
              <span className="value">{(consciousness.complexity * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Agents Card */}
        <div className="overview-card agents">
          <div className="card-header">
            <h3>Agenti</h3>
          </div>
          <div className="agents-summary">
            <div className="agent-count active">{agents.active}</div>
            <span className="agent-label">attivi su {agents.total}</span>
          </div>
          <div className="providers-row">
            {agents.providers.map(p => (
              <span key={p} className="provider-tag">{p}</span>
            ))}
          </div>
        </div>

        {/* Economy Card */}
        <div className="overview-card economy">
          <div className="card-header">
            <h3>Economia</h3>
            <span className={`data-badge ${economy.isReal ? 'real' : 'demo'}`}>
              {economy.isReal ? 'LIVE' : 'DEMO'}
            </span>
          </div>
          <div className="cost-display">
            <span className="currency">$</span>
            <span className="amount">{(economy.totalCosts || economy.costs).toFixed(4)}</span>
          </div>
          <div className="ness-bar">
            <div className="ness-fill" style={{ width: `${economy.ness * 100}%` }} />
          </div>
          <span className="ness-label">NESS: {(economy.ness * 100).toFixed(0)}%</span>
        </div>

        {/* Memory Card */}
        <div className="overview-card memory">
          <div className="card-header">
            <h3>Memoria</h3>
          </div>
          <div className="memory-bars">
            <div className="memory-row">
              <span className="type">Episodica</span>
              <div className="bar">
                <div className="fill episodic" style={{ width: `${Math.min(100, memory.episodic / 20)}%` }} />
              </div>
              <span className="count">{memory.episodic}</span>
            </div>
            <div className="memory-row">
              <span className="type">Semantica</span>
              <div className="bar">
                <div className="fill semantic" style={{ width: `${Math.min(100, memory.semantic / 10)}%` }} />
              </div>
              <span className="count">{memory.semantic}</span>
            </div>
            <div className="memory-row">
              <span className="type">Procedurale</span>
              <div className="bar">
                <div className="fill procedural" style={{ width: `${Math.min(100, memory.procedural / 5)}%` }} />
              </div>
              <span className="count">{memory.procedural}</span>
            </div>
          </div>
        </div>

        {/* Kernel Card */}
        <div className="overview-card kernel">
          <div className="card-header">
            <h3>Kernel</h3>
            <span className="mode-badge">{kernel.mode}</span>
          </div>
          <div className="kernel-stats">
            <div className="kernel-stat">
              <span className="label">Free Energy</span>
              <span className="value">{kernel.freeEnergy.toFixed(2)} nats</span>
            </div>
            <div className="kernel-stat">
              <span className="label">Pred Error</span>
              <span className="value">{kernel.predictionError.toFixed(3)}</span>
            </div>
          </div>
          <div className="kernel-levels">
            {Object.entries(kernel.levels).map(([level, data]) => (
              <div key={level} className={`level ${data.active ? 'active' : ''}`}>
                <span className="level-id">{level}</span>
                <div className="level-bar">
                  <div className="level-fill" style={{ width: `${data.load * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Events Card */}
        <div className="overview-card events">
          <div className="card-header">
            <h3>Eventi Recenti</h3>
            <span className="event-count">{events.length}</span>
          </div>
          <div className="events-list">
            {events.slice(0, 5).map(event => (
              <div key={event.id} className="event-row">
                <span className="event-dot" />
                <span className="event-type">{event.type}</span>
                <span className="event-time">
                  {Math.floor((Date.now() - event.timestamp) / 1000)}s
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <div className="no-events">Nessun evento recente</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CODE MIND VIEW - Genesis Code Introspection
// ============================================================================

function CodeMindView() {
  const { selfImprovement } = useGenesisStore();
  const { recentQueries, moduleUnderstanding, analyzingFile, analyzingProgress } = selfImprovement;

  return (
    <div className="codemind-view">
      <div className="view-header glass">
        <h2>Code Mind</h2>
        <span className={`status-badge ${analyzingFile ? 'analyzing' : 'idle'}`}>
          {analyzingFile ? '● ANALYZING' : '○ IDLE'}
        </span>
      </div>

      <div className="codemind-grid">
        {/* Currently Analyzing */}
        <div className="codemind-card analyzing-card glass">
          <h3>Currently Analyzing</h3>
          {analyzingFile ? (
            <div className="analyzing-content">
              <div className="file-name">{analyzingFile}</div>
              <div className="progress-bar">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${analyzingProgress}%` }}
                />
              </div>
              <span className="progress-label">{analyzingProgress}%</span>
            </div>
          ) : (
            <div className="no-analysis">
              <span className="empty-icon">◎</span>
              <p>No file currently being analyzed</p>
            </div>
          )}
        </div>

        {/* Recent Queries */}
        <div className="codemind-card queries-card glass">
          <h3>Recent Code Queries</h3>
          <div className="queries-list">
            {recentQueries.length > 0 ? (
              recentQueries.slice(0, 5).map((query, i) => (
                <div key={i} className="query-item">
                  <span className="query-icon">⌕</span>
                  <div className="query-info">
                    <span className="query-text">"{query.query}"</span>
                    <span className="query-results">→ {query.results} results</span>
                    {query.file && <span className="query-file">{query.file}</span>}
                  </div>
                  <span className="query-time">
                    {Math.floor((Date.now() - query.timestamp) / 1000)}s ago
                  </span>
                </div>
              ))
            ) : (
              <div className="no-queries">
                <span className="empty-icon">⌕</span>
                <p>No recent queries</p>
              </div>
            )}
          </div>
        </div>

        {/* Code Understanding */}
        <div className="codemind-card understanding-card glass">
          <h3>Code Understanding</h3>
          <div className="understanding-grid">
            {Object.entries(moduleUnderstanding).map(([module, level]) => (
              <div key={module} className="understanding-item">
                <span className="module-name">{module}</span>
                <div className="understanding-bar">
                  <motion.div
                    className="understanding-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${level * 100}%` }}
                    style={{
                      background: `linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))`,
                    }}
                  />
                </div>
                <span className="understanding-value">{(level * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EVOLUTION VIEW - Self-Improvement Pipeline
// ============================================================================

function EvolutionView() {
  const { selfImprovement, consciousness } = useGenesisStore();
  const { currentStage, cycleEnabled, currentProposal, phi, errorRate, memoryReuse, responseTime } = selfImprovement;

  const stages: Array<{ id: string; label: string }> = [
    { id: 'observe', label: 'OBSERVE' },
    { id: 'reflect', label: 'REFLECT' },
    { id: 'propose', label: 'PROPOSE' },
    { id: 'apply', label: 'APPLY' },
    { id: 'verify', label: 'VERIFY' },
  ];

  const getStageStatus = (stageId: string) => {
    const stageOrder = stages.map(s => s.id);
    const currentIndex = stageOrder.indexOf(currentStage);
    const stageIndex = stageOrder.indexOf(stageId);

    if (currentStage === 'idle') return 'pending';
    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="evolution-view">
      <div className="view-header glass">
        <h2>Evolution</h2>
        <div className="header-badges">
          <span className="phi-badge">φ={consciousness.phi.toFixed(2)}</span>
          <span className={`cycle-badge ${cycleEnabled ? 'enabled' : 'disabled'}`}>
            {cycleEnabled ? '✓ ENABLED' : '○ DISABLED'}
          </span>
        </div>
      </div>

      <div className="evolution-grid">
        {/* Pipeline */}
        <div className="evolution-card pipeline-card glass">
          <h3>Improvement Pipeline</h3>
          <div className="pipeline">
            {stages.map((stage, i) => (
              <React.Fragment key={stage.id}>
                <div className={`pipeline-stage ${getStageStatus(stage.id)}`}>
                  <div className="stage-icon">
                    {getStageStatus(stage.id) === 'completed' && '✓'}
                    {getStageStatus(stage.id) === 'active' && '●'}
                    {getStageStatus(stage.id) === 'pending' && '○'}
                  </div>
                  <span className="stage-label">{stage.label}</span>
                </div>
                {i < stages.length - 1 && <div className="pipeline-connector">───▶</div>}
              </React.Fragment>
            ))}
          </div>
          {currentStage !== 'idle' && (
            <div className="current-stage-indicator">
              ↑ CURRENT
            </div>
          )}
        </div>

        {/* Current Proposal */}
        <div className="evolution-card proposal-card glass">
          <h3>Current Proposal</h3>
          {currentProposal ? (
            <div className="proposal-content">
              <div className="proposal-header">
                <span className="proposal-id">{currentProposal.id}</span>
                <span className={`risk-badge ${currentProposal.risk.toLowerCase()}`}>
                  {currentProposal.risk}
                </span>
              </div>
              <div className="proposal-field">
                <span className="field-label">Category:</span>
                <span className="field-value">{currentProposal.category}</span>
              </div>
              <div className="proposal-field">
                <span className="field-label">Target:</span>
                <span className="field-value code">{currentProposal.target}</span>
              </div>
              <div className="proposal-field">
                <span className="field-label">Change:</span>
                <span className="field-value">{currentProposal.change}</span>
              </div>
              <div className="proposal-field">
                <span className="field-label">Reason:</span>
                <span className="field-value">{currentProposal.reason}</span>
              </div>
              <div className="proposal-field">
                <span className="field-label">Expected:</span>
                <span className="field-value">{currentProposal.expected}</span>
              </div>
              <div className="proposal-footer">
                <span className={`reversible-badge ${currentProposal.reversible ? 'yes' : 'no'}`}>
                  {currentProposal.reversible ? '✓ Reversible' : '✗ Irreversible'}
                </span>
              </div>
            </div>
          ) : (
            <div className="no-proposal">
              <span className="empty-icon">◇</span>
              <p>No active proposal</p>
            </div>
          )}
        </div>

        {/* Metrics Tracked */}
        <div className="evolution-card metrics-card glass">
          <h3>Metrics Tracked</h3>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">φ (phi)</span>
              <span className="metric-value">{phi.toFixed(2)}</span>
              <span className="metric-trend">↗</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Error Rate</span>
              <span className="metric-value">{(errorRate * 100).toFixed(1)}%</span>
              <span className="metric-trend">↘</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Memory Reuse</span>
              <span className="metric-value">{(memoryReuse * 100).toFixed(0)}%</span>
              <span className="metric-trend">↗</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Response</span>
              <span className="metric-value">{responseTime}ms</span>
              <span className="metric-trend">→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SANDBOX MONITOR VIEW - Darwin-Gödel Engine
// ============================================================================

function SandboxMonitorView() {
  const { selfImprovement } = useGenesisStore();
  const { sandboxPath, sandboxProgress, invariantResults, buildOutput } = selfImprovement;

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '●';
      case 'failed': return '✗';
      default: return '○';
    }
  };

  return (
    <div className="sandbox-view">
      <div className="view-header glass">
        <h2>Sandbox</h2>
        <span className={`status-badge ${sandboxPath ? 'running' : 'idle'}`}>
          {sandboxPath ? '● RUNNING' : '○ IDLE'}
        </span>
      </div>

      <div className="sandbox-grid">
        {/* Sandbox Path */}
        {sandboxPath && (
          <div className="sandbox-path glass">
            <span className="path-label">Sandbox:</span>
            <code className="path-value">{sandboxPath}</code>
          </div>
        )}

        {/* Verification Steps */}
        <div className="sandbox-card steps-card glass">
          <h3>Verification Steps</h3>
          <div className="steps-list">
            {sandboxProgress.length > 0 ? (
              sandboxProgress.map(step => (
                <div key={step.id} className={`step-item ${step.status}`}>
                  <span className={`step-icon ${step.status}`}>{getStepIcon(step.status)}</span>
                  <span className="step-name">{step.name}</span>
                  {step.status === 'running' && step.progress !== undefined && (
                    <div className="step-progress">
                      <div className="step-progress-bar">
                        <div className="step-progress-fill" style={{ width: `${step.progress}%` }} />
                      </div>
                      <span className="step-progress-label">{step.progress}%</span>
                    </div>
                  )}
                  {step.duration && (
                    <span className="step-duration">{(step.duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
              ))
            ) : (
              <div className="no-steps">
                <span className="empty-icon">🧪</span>
                <p>No sandbox activity</p>
              </div>
            )}
          </div>
        </div>

        {/* Invariant Status */}
        <div className="sandbox-card invariants-card glass">
          <h3>Invariant Status</h3>
          <div className="invariants-list">
            {invariantResults.length > 0 ? (
              invariantResults.map(inv => (
                <div key={inv.id} className={`invariant-item ${inv.passed ? 'passed' : 'failed'}`}>
                  <span className="invariant-id">{inv.id}</span>
                  <span className="invariant-name">{inv.name}</span>
                  <span className={`invariant-status ${inv.passed ? 'pass' : 'fail'}`}>
                    {inv.passed ? '✓ PASS' : '✗ FAIL'}
                  </span>
                  {inv.message && <span className="invariant-message">{inv.message}</span>}
                </div>
              ))
            ) : (
              <div className="no-invariants">
                <span className="empty-icon">⚖</span>
                <p>No invariant checks yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Build Output */}
        <div className="sandbox-card output-card glass">
          <h3>Build Output</h3>
          <div className="output-terminal">
            {buildOutput.length > 0 ? (
              buildOutput.map((line, i) => (
                <div key={i} className={`output-line ${line.startsWith('✓') ? 'success' : line.startsWith('✗') ? 'error' : ''}`}>
                  {line}
                </div>
              ))
            ) : (
              <div className="no-output">
                <span className="cursor">▌</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LESSONS VIEW - Learning Memory
// ============================================================================

function LessonsView() {
  const { selfImprovement } = useGenesisStore();
  const { lessons, successRate, totalAttempts } = selfImprovement;

  const categoryIcons: Record<string, string> = {
    performance: '⚡',
    memory: '🧠',
    errors: '🐛',
    phi: 'φ',
    agents: '⬡',
  };

  const categoryColors: Record<string, string> = {
    performance: 'var(--accent-green)',
    memory: 'var(--accent-purple)',
    errors: 'var(--accent-red)',
    phi: 'var(--accent-cyan)',
    agents: 'var(--accent-yellow)',
  };

  // Count lessons by category
  const categoryCount: Record<string, number> = {};
  lessons.forEach(l => {
    categoryCount[l.category] = (categoryCount[l.category] || 0) + 1;
  });

  return (
    <div className="lessons-view">
      <div className="view-header glass">
        <h2>Lessons Learned</h2>
        <span className="lessons-count">{lessons.length} memories</span>
      </div>

      <div className="lessons-grid">
        {/* Success Rate */}
        <div className="lessons-card rate-card glass">
          <h3>Success/Failure Rate</h3>
          <div className="success-rate-bar">
            <div
              className="success-fill"
              style={{ width: `${successRate * 100}%` }}
            />
          </div>
          <span className="rate-label">
            {(successRate * 100).toFixed(0)}% Success ({Math.round(successRate * totalAttempts)}/{totalAttempts})
          </span>
        </div>

        {/* Recent Lessons */}
        <div className="lessons-card recent-card glass">
          <h3>Recent Lessons</h3>
          <div className="lessons-list">
            {lessons.length > 0 ? (
              lessons.slice(0, 10).map(lesson => (
                <div key={lesson.id} className={`lesson-item ${lesson.type}`}>
                  <span className={`lesson-icon ${lesson.type}`}>
                    {lesson.type === 'positive' ? '✓' : '✗'}
                  </span>
                  <div className="lesson-content">
                    <span className="lesson-text">"{lesson.content}"</span>
                    <div className="lesson-meta">
                      <span className="lesson-confidence">Confidence: {(lesson.confidence * 100).toFixed(0)}%</span>
                      <span className="lesson-applied">Applied: {lesson.appliedCount}x</span>
                    </div>
                    <div className="lesson-retention">
                      <span className="retention-label">Retention:</span>
                      <div className="retention-bar">
                        <div
                          className="retention-fill"
                          style={{ width: `${lesson.retention * 100}%` }}
                        />
                      </div>
                      <span className="retention-value">{(lesson.retention * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <span
                    className="lesson-category"
                    style={{ color: categoryColors[lesson.category] || 'var(--text-secondary)' }}
                  >
                    {categoryIcons[lesson.category] || '○'} {lesson.category}
                  </span>
                </div>
              ))
            ) : (
              <div className="no-lessons">
                <span className="empty-icon">🧠</span>
                <p>No lessons learned yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Knowledge by Category */}
        <div className="lessons-card categories-card glass">
          <h3>Knowledge by Category</h3>
          <div className="categories-grid">
            {Object.entries(categoryCount).map(([cat, count]) => (
              <div key={cat} className="category-item">
                <span className="category-icon" style={{ color: categoryColors[cat] }}>
                  {categoryIcons[cat] || '○'}
                </span>
                <span className="category-name">{cat}</span>
                <span className="category-count">{count}</span>
              </div>
            ))}
            {Object.keys(categoryCount).length === 0 && (
              <div className="no-categories">
                <p>No categorized knowledge yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Forgetting Curve Info */}
        <div className="lessons-card curve-card glass">
          <h3>Forgetting Curve (Ebbinghaus)</h3>
          <div className="curve-viz">
            <svg viewBox="0 0 200 100" className="curve-svg">
              <path
                d="M 0 10 Q 50 20, 100 50 T 200 90"
                fill="none"
                stroke="var(--accent-purple)"
                strokeWidth="2"
              />
              <text x="10" y="15" className="curve-label">100%</text>
              <text x="10" y="95" className="curve-label">0%</text>
              <text x="20" y="85" className="curve-label">0</text>
              <text x="50" y="85" className="curve-label">1d</text>
              <text x="90" y="85" className="curve-label">7d</text>
              <text x="130" y="85" className="curve-label">30d</text>
              <text x="170" y="85" className="curve-label">90d</text>
            </svg>
            <div className="curve-formula">
              R(t) = R₀ × e<sup>−t/S</sup>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVE INFERENCE VIEW
// ============================================================================

function ActiveInferenceView() {
  const { activeInference, kernel } = useGenesisStore();
  const { currentCycle, beliefs, selectedAction, lastSurprise, avgSurprise, isRunning, surpriseHistory } = activeInference;

  // Surprise history for time series
  const surpriseSeries = useMemo(() => [{
    id: 'surprise',
    data: surpriseHistory.map((s) => ({ timestamp: s.timestamp, value: s.value })),
    color: '#ff8800',
    label: 'Surprise',
  }], [surpriseHistory]);

  return (
    <div className="inference-view">
      <div className="view-header glass">
        <h2>Active Inference</h2>
        <StatusIndicator
          status={isRunning ? 'online' : 'offline'}
          label={isRunning ? 'Running' : 'Idle'}
          showPulse={isRunning}
        />
      </div>

      <div className="inference-grid">
        {/* Free Energy Gauge */}
        <Panel title="Free Energy Principle" variant="glass">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <FreeEnergyGauge
              freeEnergy={kernel.freeEnergy}
              surprise={lastSurprise}
              predictionError={kernel.predictionError}
              size={200}
              maxEnergy={5}
            />
          </div>
        </Panel>

        {/* Current Cycle */}
        <Panel title="Inference Cycle" variant="glass">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <motion.div
              style={{ fontSize: 48, fontWeight: 'bold', color: '#00ff88', fontFamily: 'monospace' }}
              key={currentCycle}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              {currentCycle}
            </motion.div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
              Current Cycle
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <MetricCard
              title="Free Energy"
              value={kernel.freeEnergy.toFixed(3)}
              color={kernel.freeEnergy > 2 ? '#ff4444' : '#00ff88'}
              trend={kernel.freeEnergy > avgSurprise ? 'up' : 'down'}
              size="sm"
            />
            <MetricCard
              title="Prediction Error"
              value={kernel.predictionError.toFixed(3)}
              color="#8888ff"
              size="sm"
            />
          </div>
        </Panel>

        {/* Beliefs */}
        <Panel title="Current Beliefs" variant="glass">
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            {Object.entries(beliefs).length > 0 ? (
              Object.entries(beliefs).map(([key, value]) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>{key.replace(/_/g, ' ')}</span>
                  <span style={{
                    color: value === 'high' ? '#00ff88' : value === 'low' ? '#ff4444' : '#ffaa00',
                    fontWeight: 600,
                  }}>
                    {value}
                  </span>
                </motion.div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)' }}>
                No beliefs formed yet
              </div>
            )}
          </div>
        </Panel>

        {/* Selected Action */}
        <Panel title="Selected Action" variant="glass">
          <div style={{ textAlign: 'center', padding: 16 }}>
            {selectedAction ? (
              <motion.div
                key={selectedAction}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <span style={{ fontSize: 24, color: '#00ff88' }}>→</span>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, textTransform: 'capitalize' }}>
                  {selectedAction}
                </div>
              </motion.div>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>No action selected</span>
            )}
          </div>
        </Panel>

        {/* Surprise History Chart */}
        <Panel title="Surprise History" variant="glass" padding="sm">
          <TimeSeriesChart
            series={surpriseSeries}
            width={400}
            height={150}
            showLegend={false}
            yDomain={[0, 1]}
            timeWindow={60000}
          />
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: lastSurprise > 0.5 ? '#ff8800' : '#00ff88' }}>
                {lastSurprise.toFixed(3)}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Last Surprise</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: 'rgba(255,255,255,0.8)' }}>
                {avgSurprise.toFixed(3)}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Average</div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// NOCICEPTION (PAIN) VIEW
// ============================================================================

function NociceptionView() {
  const { nociception } = useGenesisStore();
  const { totalPain, threshold, adaptation, activeStimuli, painHistory } = nociception;

  const getPainLevel = (pain: number) => {
    if (pain < 0.3) return 'low';
    if (pain < 0.6) return 'medium';
    if (pain < 0.8) return 'high';
    return 'critical';
  };

  // Convert stimuli for PainBodyMap
  const stimuliForMap = useMemo(() => {
    return activeStimuli.map((s) => ({
      id: s.id,
      type: s.type,
      intensity: s.intensity,
      source: s.location || 'system',
      timestamp: Date.now(),
    }));
  }, [activeStimuli]);

  // Pain history for time series
  const painSeries = useMemo(() => [{
    id: 'pain',
    data: painHistory.map((p) => ({ timestamp: p.timestamp, value: p.value })),
    color: totalPain > 0.6 ? '#ff4444' : totalPain > 0.3 ? '#ffaa00' : '#00ff88',
    label: 'Pain Level',
  }], [painHistory, totalPain]);

  return (
    <div className="nociception-view">
      <div className="view-header glass">
        <h2>Nociception System</h2>
        <StatusIndicator
          status={totalPain > 0.6 ? 'error' : totalPain > 0.3 ? 'warning' : 'success'}
          label={`Pain Level: ${(totalPain * 100).toFixed(0)}%`}
        />
      </div>

      <div className="nociception-grid">
        {/* Pain Body Map Visualization */}
        <Panel title="Pain Map" variant="glass" padding="sm">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <PainBodyMap
              stimuli={stimuliForMap}
              totalPain={totalPain}
              threshold={threshold}
              adaptation={adaptation}
              size={280}
            />
          </div>
        </Panel>

        {/* Pain Gauge */}
        <Panel title="Total Pain" variant="glass">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <CircularGauge
              value={totalPain}
              size={140}
              color={totalPain > 0.6 ? '#ff4444' : totalPain > 0.3 ? '#ffaa00' : '#00ff88'}
              label="Total Pain"
              unit="%"
              glow={totalPain > 0.5}
            />
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: 'rgba(255,255,255,0.8)' }}>{(threshold * 100).toFixed(0)}%</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Threshold</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#00ff88' }}>{(adaptation * 100).toFixed(0)}%</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Adaptation</div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Active Stimuli */}
        <Panel title="Active Stimuli" variant="glass">
          <div className="stimuli-list" style={{ maxHeight: 200, overflow: 'auto' }}>
            {activeStimuli.length > 0 ? (
              activeStimuli.map((stimulus) => (
                <motion.div
                  key={stimulus.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    background: `rgba(255,68,68,${stimulus.intensity * 0.3})`,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8,
                    borderLeft: '3px solid #ff4444',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 500 }}>{stimulus.location || 'Unknown'}</span>
                    <span style={{ color: '#ff4444', fontSize: 12 }}>{stimulus.type}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                    <motion.div
                      style={{ height: '100%', background: '#ff4444', borderRadius: 2 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${stimulus.intensity * 100}%` }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    Intensity: {(stimulus.intensity * 100).toFixed(0)}%
                  </div>
                </motion.div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#00ff88' }}>
                <span style={{ fontSize: 24 }}>✓</span>
                <div style={{ marginTop: 8 }}>No pain stimuli detected</div>
              </div>
            )}
          </div>
        </Panel>

        {/* Pain History Chart */}
        <Panel title="Pain History" variant="glass" padding="sm">
          <TimeSeriesChart
            series={painSeries}
            width={380}
            height={150}
            showLegend={false}
            yDomain={[0, 1]}
            timeWindow={120000}
          />
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// ALLOSTASIS VIEW
// ============================================================================

function AllostasisView() {
  const { allostasis } = useGenesisStore();
  const { variables, isThrottled, throttleMagnitude, isHibernating, hibernationDuration, deferredVariables } = allostasis;

  return (
    <div className="allostasis-view">
      <div className="view-header glass">
        <h2>Allostatic Regulation</h2>
        <div className="status-badges">
          {isThrottled && <span className="badge throttle">⚠ THROTTLED ({(throttleMagnitude * 100).toFixed(0)}%)</span>}
          {isHibernating && <span className="badge hibernate">💤 HIBERNATING ({hibernationDuration}ms)</span>}
        </div>
      </div>

      <div className="allostasis-grid">
        {/* Variables */}
        <div className="allostasis-card variables-card glass">
          <h3>Regulated Variables</h3>
          <div className="variables-list">
            {variables.map((variable) => {
              const deviation = Math.abs(variable.current - variable.setpoint);
              const status = deviation < 0.1 ? 'stable' : deviation < 0.3 ? 'adjusting' : 'critical';
              return (
                <div key={variable.name} className={`variable-item ${status}`}>
                  <div className="variable-header">
                    <span className="variable-name">{variable.name}</span>
                    <span className={`urgency-badge ${variable.urgency > 0.5 ? 'high' : 'low'}`}>
                      Urgency: {(variable.urgency * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="variable-bar">
                    <div className="bar-track">
                      <div
                        className="setpoint-marker"
                        style={{ left: `${variable.setpoint * 100}%` }}
                      />
                      <div
                        className="current-fill"
                        style={{ width: `${variable.current * 100}%` }}
                      />
                    </div>
                    <div className="bar-labels">
                      <span>Current: {(variable.current * 100).toFixed(0)}%</span>
                      <span>Setpoint: {(variable.setpoint * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  {variable.action && (
                    <div className="variable-action">
                      Action: {variable.action}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Deferred Variables */}
        {deferredVariables.length > 0 && (
          <div className="allostasis-card deferred-card glass">
            <h3>Deferred Regulations</h3>
            <div className="deferred-list">
              {deferredVariables.map((v) => (
                <div key={v} className="deferred-item">
                  <span className="icon">⏸</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Homeostatic Summary */}
        <div className="allostasis-card summary-card glass">
          <h3>System Balance</h3>
          <div className="balance-indicator">
            <div className="balance-scale">
              {variables.map((v) => (
                <div
                  key={v.name}
                  className="balance-dot"
                  style={{
                    left: `${v.current * 100}%`,
                    backgroundColor: Math.abs(v.current - v.setpoint) < 0.1 ? '#10b981' : '#f59e0b',
                  }}
                  title={v.name}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WORLD MODEL VIEW
// ============================================================================

function WorldModelView() {
  const { worldModel } = useGenesisStore();
  const { totalFacts, predictions, violations, causalChainsActive } = worldModel;

  return (
    <div className="worldmodel-view">
      <div className="view-header glass">
        <h2>World Model</h2>
        <div className="stats">
          <span className="stat">{totalFacts} facts</span>
          <span className="stat">{causalChainsActive} causal chains</span>
        </div>
      </div>

      <div className="worldmodel-grid">
        {/* Predictions */}
        <div className="worldmodel-card predictions-card glass">
          <h3>Active Predictions</h3>
          <div className="predictions-list">
            {predictions.length > 0 ? (
              predictions.slice(0, 10).map((pred) => (
                <div key={pred.id} className="prediction-item">
                  <div className="prediction-header">
                    <span className="prediction-domain">{pred.domain}</span>
                    <span className={`confidence ${pred.confidence > 0.7 ? 'high' : 'low'}`}>
                      {(pred.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="prediction-text">{pred.prediction}</div>
                  {pred.verified !== undefined && (
                    <span className={`verified-badge ${pred.verified ? 'true' : 'false'}`}>
                      {pred.verified ? '✓ Verified' : '✗ Failed'}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="no-data">No active predictions</div>
            )}
          </div>
        </div>

        {/* Consistency Violations */}
        <div className="worldmodel-card violations-card glass">
          <h3>Consistency Violations</h3>
          <div className="violations-list">
            {violations.length > 0 ? (
              violations.slice(0, 10).map((viol) => (
                <div key={viol.id} className="violation-item">
                  <div className="violation-claim">"{viol.claim}"</div>
                  <div className="violation-conflict">
                    <span className="icon">↔</span>
                    Conflicts with: "{viol.conflictsWith}"
                  </div>
                  <div className="violation-resolution">
                    Resolution: {viol.resolution}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-violations">
                <span className="icon">✓</span>
                <span>No consistency violations</span>
              </div>
            )}
          </div>
        </div>

        {/* Causal Graph Placeholder */}
        <div className="worldmodel-card graph-card glass">
          <h3>Causal Structure</h3>
          <div className="graph-placeholder">
            <span className="icon">🌐</span>
            <span>{causalChainsActive} active causal chains</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DAEMON VIEW
// ============================================================================

function DaemonView() {
  const { daemon } = useGenesisStore();
  const { state, tasks, dreamPhase, dreamConsolidations, dreamInsights, lastMaintenance, maintenanceIssues, maintenanceFixed } = daemon;

  const getStateColor = (s: string) => {
    switch (s) {
      case 'running': return '#10b981';
      case 'dreaming': return '#8b5cf6';
      case 'maintaining': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="daemon-view">
      <div className="view-header glass">
        <h2>Daemon Controller</h2>
        <span className="state-badge" style={{ color: getStateColor(state) }}>
          ● {state.toUpperCase()}
        </span>
      </div>

      <div className="daemon-grid">
        {/* State Overview */}
        <div className="daemon-card state-card glass">
          <h3>Current State</h3>
          <div className="state-display">
            <span className="state-icon" style={{ color: getStateColor(state) }}>
              {state === 'dreaming' ? '💤' : state === 'maintaining' ? '🔧' : state === 'running' ? '▶' : '⏸'}
            </span>
            <span className="state-text">{state}</span>
          </div>
          {dreamPhase && (
            <div className="dream-info">
              <span className="label">Dream Phase:</span>
              <span className="value">{dreamPhase}</span>
              <div className="dream-stats">
                <span>{dreamConsolidations} consolidations</span>
                <span>{dreamInsights} insights</span>
              </div>
            </div>
          )}
        </div>

        {/* Task Queue */}
        <div className="daemon-card tasks-card glass">
          <h3>Task Queue</h3>
          <div className="tasks-list">
            {tasks.length > 0 ? (
              tasks.slice(0, 10).map((task) => (
                <div key={task.id} className={`task-item ${task.status}`}>
                  <div className="task-header">
                    <span className="task-name">{task.name}</span>
                    <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                  </div>
                  <div className="task-status">
                    <span className={`status ${task.status}`}>{task.status}</span>
                    {task.error && <span className="error">{task.error}</span>}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-tasks">No scheduled tasks</div>
            )}
          </div>
        </div>

        {/* Maintenance Stats */}
        <div className="daemon-card maintenance-card glass">
          <h3>Last Maintenance</h3>
          {lastMaintenance ? (
            <div className="maintenance-info">
              <div className="maintenance-time">
                {new Date(lastMaintenance).toLocaleString()}
              </div>
              <div className="maintenance-stats">
                <div className="stat">
                  <span className="label">Issues Found</span>
                  <span className="value">{maintenanceIssues}</span>
                </div>
                <div className="stat">
                  <span className="label">Fixed</span>
                  <span className="value good">{maintenanceFixed}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="no-maintenance">No maintenance run yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FINANCE VIEW
// ============================================================================

function FinanceView() {
  const { finance } = useGenesisStore();
  const { totalPortfolioValue, unrealizedPnL, realizedPnL, positions, signals, regime, riskLevel, drawdown, winRate, sharpeRatio } = finance;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div className="finance-view">
      <div className="view-header glass">
        <h2>Finance & Trading</h2>
        <div className="header-stats">
          <span className={`regime-badge ${regime}`}>{regime} regime</span>
          <span className="risk-level">Risk: {(riskLevel * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="finance-grid">
        {/* Portfolio Overview */}
        <div className="finance-card portfolio-card glass">
          <h3>Portfolio</h3>
          <div className="portfolio-value">{formatCurrency(totalPortfolioValue)}</div>
          <div className="pnl-stats">
            <div className={`pnl unrealized ${unrealizedPnL >= 0 ? 'positive' : 'negative'}`}>
              <span className="label">Unrealized P&L</span>
              <span className="value">{formatCurrency(unrealizedPnL)}</span>
            </div>
            <div className={`pnl realized ${realizedPnL >= 0 ? 'positive' : 'negative'}`}>
              <span className="label">Realized P&L</span>
              <span className="value">{formatCurrency(realizedPnL)}</span>
            </div>
          </div>
          <div className="performance-metrics">
            <div className="metric">
              <span className="label">Win Rate</span>
              <span className="value">{(winRate * 100).toFixed(1)}%</span>
            </div>
            <div className="metric">
              <span className="label">Sharpe Ratio</span>
              <span className="value">{sharpeRatio.toFixed(2)}</span>
            </div>
            <div className="metric">
              <span className="label">Drawdown</span>
              <span className={`value ${drawdown > 0.1 ? 'warning' : ''}`}>
                {(drawdown * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Positions */}
        <div className="finance-card positions-card glass">
          <h3>Open Positions</h3>
          <div className="positions-list">
            {positions.length > 0 ? (
              positions.map((pos) => (
                <div key={pos.symbol} className={`position-item ${pos.direction}`}>
                  <div className="position-header">
                    <span className="symbol">{pos.symbol}</span>
                    <span className={`direction ${pos.direction}`}>{pos.direction.toUpperCase()}</span>
                  </div>
                  <div className="position-details">
                    <span>Size: {pos.size}</span>
                    <span>Entry: {formatCurrency(pos.entryPrice)}</span>
                    <span>Current: {formatCurrency(pos.currentPrice)}</span>
                  </div>
                  <div className={`position-pnl ${pos.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(pos.pnl)} ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                  </div>
                </div>
              ))
            ) : (
              <div className="no-positions">No open positions</div>
            )}
          </div>
        </div>

        {/* Signals */}
        <div className="finance-card signals-card glass">
          <h3>Trading Signals</h3>
          <div className="signals-list">
            {signals.length > 0 ? (
              signals.slice(0, 5).map((sig) => (
                <div key={sig.id} className={`signal-item ${sig.direction}`}>
                  <div className="signal-header">
                    <span className="symbol">{sig.symbol}</span>
                    <span className={`action ${sig.action}`}>{sig.action.toUpperCase()}</span>
                  </div>
                  <div className="signal-strength">
                    <div className="strength-bar" style={{ width: `${sig.strength * 100}%` }} />
                    <span>{(sig.strength * 100).toFixed(0)}% strength</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-signals">No active signals</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// REVENUE VIEW
// ============================================================================

function RevenueView() {
  const { revenue } = useGenesisStore();
  const { totalEarned, streams, opportunities, recentTasks, avgROI } = revenue;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div className="revenue-view">
      <div className="view-header glass">
        <h2>Revenue Streams</h2>
        <div className="total-earned">{formatCurrency(totalEarned)} earned</div>
      </div>

      <div className="revenue-grid">
        {/* Streams */}
        <div className="revenue-card streams-card glass">
          <h3>Active Streams</h3>
          <div className="streams-list">
            {streams.length > 0 ? (
              streams.map((stream) => (
                <div key={stream.name} className={`stream-item ${stream.status}`}>
                  <div className="stream-header">
                    <span className="stream-name">{stream.name}</span>
                    <span className={`status-badge ${stream.status}`}>{stream.status}</span>
                  </div>
                  <div className="stream-stats">
                    <span>Earned: {formatCurrency(stream.totalEarned)}</span>
                    <span>Success: {(stream.successRate * 100).toFixed(0)}%</span>
                    <span>Tasks: {stream.taskCount}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-streams">No active revenue streams</div>
            )}
          </div>
        </div>

        {/* Opportunities */}
        <div className="revenue-card opportunities-card glass">
          <h3>Opportunities</h3>
          <div className="opportunities-list">
            {opportunities.length > 0 ? (
              opportunities.slice(0, 5).map((opp) => (
                <div key={opp.id} className="opportunity-item">
                  <div className="opportunity-header">
                    <span className="stream">{opp.stream}</span>
                    <span className={`roi ${opp.roi > 1 ? 'positive' : 'negative'}`}>
                      ROI: {(opp.roi * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="opportunity-details">
                    <span>Est. Revenue: {formatCurrency(opp.estimatedRevenue)}</span>
                    <span>Est. Cost: {formatCurrency(opp.estimatedCost)}</span>
                    <span className={`risk ${opp.risk > 0.5 ? 'high' : 'low'}`}>
                      Risk: {(opp.risk * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-opportunities">No pending opportunities</div>
            )}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="revenue-card tasks-card glass">
          <h3>Recent Tasks</h3>
          <div className="tasks-list">
            {recentTasks.length > 0 ? (
              recentTasks.slice(0, 5).map((task) => (
                <div key={task.id} className={`task-item ${task.success ? 'success' : 'failed'}`}>
                  <div className="task-header">
                    <span className="stream">{task.stream}</span>
                    <span className={`status ${task.success ? 'success' : 'failed'}`}>
                      {task.success ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="task-result">
                    Revenue: {formatCurrency(task.actualRevenue)} | Cost: {formatCurrency(task.actualCost)}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-tasks">No recent tasks</div>
            )}
          </div>
        </div>

        {/* ROI Summary */}
        <div className="revenue-card roi-card glass">
          <h3>Average ROI</h3>
          <div className={`roi-value ${avgROI > 1 ? 'positive' : 'negative'}`}>
            {(avgROI * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONTENT VIEW
// ============================================================================

function ContentView() {
  const { content } = useGenesisStore();
  const { totalPublished, totalScheduled, avgEngagementRate, topPlatform, content: contentItems, insights } = content;

  return (
    <div className="content-view">
      <div className="view-header glass">
        <h2>Content Engine</h2>
        <div className="header-stats">
          <span>{totalPublished} published</span>
          <span>{totalScheduled} scheduled</span>
        </div>
      </div>

      <div className="content-grid">
        {/* Overview */}
        <div className="content-card overview-card glass">
          <h3>Performance</h3>
          <div className="performance-stats">
            <div className="stat">
              <span className="label">Avg Engagement</span>
              <span className="value">{(avgEngagementRate * 100).toFixed(1)}%</span>
            </div>
            {topPlatform && (
              <div className="stat">
                <span className="label">Top Platform</span>
                <span className="value">{topPlatform}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Items */}
        <div className="content-card items-card glass">
          <h3>Recent Content</h3>
          <div className="content-list">
            {contentItems.length > 0 ? (
              contentItems.slice(0, 5).map((item) => (
                <div key={item.id} className={`content-item ${item.status}`}>
                  <div className="content-header">
                    <span className="content-type">{item.type}</span>
                    <span className={`status-badge ${item.status}`}>{item.status}</span>
                  </div>
                  <div className="content-topic">{item.topic}</div>
                  <div className="content-platforms">
                    {item.platforms.map((p) => (
                      <span key={p} className="platform-tag">{p}</span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="no-content">No content created yet</div>
            )}
          </div>
        </div>

        {/* Insights */}
        <div className="content-card insights-card glass">
          <h3>AI Insights</h3>
          <div className="insights-list">
            {insights.length > 0 ? (
              insights.slice(0, 5).map((insight) => (
                <div key={insight.id} className="insight-item">
                  <div className="insight-type">{insight.type.replace('_', ' ')}</div>
                  <div className="insight-recommendation">{insight.recommendation}</div>
                  <div className="insight-confidence">
                    Confidence: {(insight.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              ))
            ) : (
              <div className="no-insights">No insights yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SWARM VIEW
// ============================================================================

function SwarmView() {
  const { swarm, agents } = useGenesisStore();
  const { agentCount, activeCoordinations, patterns, collectiveIntelligence, consensusLevel } = swarm;

  // Convert patterns to component format
  const swarmAgents = useMemo(() => {
    return Array.from({ length: agentCount }, (_, i) => ({
      id: `agent-${i}`,
      role: ['explorer', 'exploiter', 'coordinator', 'specialist'][i % 4],
      status: i < agents.active ? 'active' as const : 'idle' as const,
      load: 0.3 + Math.random() * 0.5,
      contribution: Math.random(),
    }));
  }, [agentCount, agents.active]);

  const swarmPatterns = useMemo(() => {
    return patterns.map((p) => ({
      id: p.id,
      type: p.pattern,
      strength: p.confidence,
      participants: p.agents.length,
    }));
  }, [patterns]);

  return (
    <div className="swarm-view">
      <div className="view-header glass">
        <h2>Swarm Intelligence</h2>
        <div className="header-stats">
          <StatusIndicator status={agents.active > 0 ? 'online' : 'offline'} label={`${agentCount} agents`} size="sm" />
          <span>{activeCoordinations} coordinations</span>
        </div>
      </div>

      <div className="swarm-grid">
        {/* 3D Swarm Visualization */}
        <Panel title="Swarm Visualization" variant="glass" padding="none">
          <SwarmVisualization
            agents={swarmAgents}
            patterns={swarmPatterns}
            width={450}
            height={350}
            showConnections={true}
            rotateCamera={true}
          />
        </Panel>

        {/* Collective Metrics with Gauges */}
        <Panel title="Collective Metrics" variant="glass">
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            <CircularGauge
              value={collectiveIntelligence}
              label="Intelligence"
              color="#00ff88"
              size={100}
            />
            <CircularGauge
              value={consensusLevel}
              label="Consensus"
              color="#8888ff"
              size={100}
            />
          </div>
        </Panel>

        {/* Emergent Patterns */}
        <Panel title="Emergent Patterns" variant="glass">
          <div className="patterns-list">
            {patterns.length > 0 ? (
              patterns.map((pattern) => (
                <motion.div
                  key={pattern.id}
                  className="pattern-item"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    borderLeft: `3px solid #00ff88`,
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#00ff88', marginBottom: 4 }}>{pattern.pattern}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {pattern.agents.slice(0, 3).map((a) => (
                      <span key={a} style={{ background: 'rgba(0,255,136,0.2)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{a}</span>
                    ))}
                    {pattern.agents.length > 3 && (
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>+{pattern.agents.length - 3} more</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    Confidence: {(pattern.confidence * 100).toFixed(0)}%
                  </div>
                </motion.div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.4)' }}>
                No emergent patterns detected
              </div>
            )}
          </div>
        </Panel>

        {/* Agent Distribution */}
        <Panel title="Agent Status" variant="glass">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: 'rgba(255,255,255,0.9)' }}>{agents.total}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Total</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#00ff88' }}>{agents.active}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Active</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ffaa00' }}>{agents.queued}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Queued</div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// HEALING VIEW
// ============================================================================

function HealingView() {
  const { healing } = useGenesisStore();
  const { isActive, currentTarget, issuesDetected, issuesRepaired, history } = healing;

  return (
    <div className="healing-view">
      <div className="view-header glass">
        <h2>Self-Healing System</h2>
        <span className={`status-badge ${isActive ? 'active' : 'idle'}`}>
          {isActive ? '● HEALING' : '○ IDLE'}
        </span>
      </div>

      <div className="healing-grid">
        {/* Current Status */}
        <div className="healing-card status-card glass">
          <h3>Current Status</h3>
          {isActive && currentTarget ? (
            <div className="active-healing">
              <span className="healing-icon">💊</span>
              <span className="target">Healing: {currentTarget}</span>
            </div>
          ) : (
            <div className="idle-status">
              <span className="icon">✓</span>
              <span>System healthy</span>
            </div>
          )}
          <div className="healing-stats">
            <div className="stat">
              <span className="label">Detected</span>
              <span className="value">{issuesDetected}</span>
            </div>
            <div className="stat success">
              <span className="label">Repaired</span>
              <span className="value">{issuesRepaired}</span>
            </div>
          </div>
        </div>

        {/* History */}
        <div className="healing-card history-card glass">
          <h3>Healing History</h3>
          <div className="history-list">
            {history.length > 0 ? (
              history.slice(0, 10).map((event) => (
                <div key={event.id} className={`history-item ${event.status}`}>
                  <div className="event-header">
                    <span className="target">{event.target}</span>
                    <span className={`status ${event.status}`}>
                      {event.status === 'completed' ? '✓' : event.status === 'failed' ? '✗' : '●'}
                    </span>
                  </div>
                  <div className="event-details">
                    <span>{event.issuesFixed} issues fixed</span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-history">No healing events</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GROUNDING VIEW
// ============================================================================

function GroundingView() {
  const { grounding } = useGenesisStore();
  const { claimsVerified, claimsPending, factAccuracy, recentClaims } = grounding;

  return (
    <div className="grounding-view">
      <div className="view-header glass">
        <h2>Fact Grounding</h2>
        <div className="accuracy-badge">
          Accuracy: {(factAccuracy * 100).toFixed(1)}%
        </div>
      </div>

      <div className="grounding-grid">
        {/* Stats */}
        <div className="grounding-card stats-card glass">
          <h3>Verification Stats</h3>
          <div className="stats-grid">
            <div className="stat">
              <span className="value">{claimsVerified}</span>
              <span className="label">Verified</span>
            </div>
            <div className="stat pending">
              <span className="value">{claimsPending}</span>
              <span className="label">Pending</span>
            </div>
            <div className="stat accuracy">
              <span className="value">{(factAccuracy * 100).toFixed(0)}%</span>
              <span className="label">Accuracy</span>
            </div>
          </div>
        </div>

        {/* Recent Claims */}
        <div className="grounding-card claims-card glass">
          <h3>Recent Verifications</h3>
          <div className="claims-list">
            {recentClaims.length > 0 ? (
              recentClaims.slice(0, 10).map((claim) => (
                <div key={claim.id} className={`claim-item ${claim.verified ? 'verified' : 'unverified'}`}>
                  <div className="claim-text">"{claim.claim}"</div>
                  <div className="claim-result">
                    <span className={`status ${claim.verified ? 'verified' : 'unverified'}`}>
                      {claim.verified ? '✓ Verified' : '✗ Unverified'}
                    </span>
                    <span className="confidence">
                      {(claim.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  {claim.source && (
                    <div className="claim-source">Source: {claim.source}</div>
                  )}
                </div>
              ))
            ) : (
              <div className="no-claims">No claims verified yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HISTORY VIEW - Modification Timeline
// ============================================================================

function HistoryView() {
  const { selfImprovement } = useGenesisStore();
  const { modifications, totalAttempts } = selfImprovement;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '●';
      case 'failed': return '●';
      case 'rolled_back': return '↩';
      default: return '○';
    }
  };

  return (
    <div className="history-view">
      <div className="view-header glass">
        <h2>Modification History</h2>
        <span className="history-count">{totalAttempts} total</span>
      </div>

      <div className="history-timeline">
        {modifications.length > 0 ? (
          modifications.map((mod, i) => (
            <div key={mod.id} className={`timeline-item ${mod.status}`}>
              <div className="timeline-connector">
                <div className={`timeline-dot ${mod.status}`}>
                  {getStatusIcon(mod.status)}
                </div>
                {i < modifications.length - 1 && <div className="timeline-line" />}
              </div>
              <div className="timeline-content glass">
                <div className="timeline-header">
                  <span className="timeline-time">{formatTime(mod.timestamp)}</span>
                  <span className={`timeline-status ${mod.status}`}>
                    {mod.status.toUpperCase()}
                  </span>
                </div>
                <div className="timeline-description">{mod.description}</div>
                {mod.metrics && (
                  <div className="timeline-metrics">
                    {Object.entries(mod.metrics.before).map(([key, before]) => {
                      const after = mod.metrics!.after[key];
                      const change = after - (before as number);
                      const changePercent = ((change / (before as number)) * 100).toFixed(0);
                      return (
                        <span key={key} className={`metric-change ${change >= 0 ? 'positive' : 'negative'}`}>
                          {key}: {(before as number).toFixed(2)} → {after.toFixed(2)} ({change >= 0 ? '+' : ''}{changePercent}%)
                        </span>
                      );
                    })}
                  </div>
                )}
                {mod.commitHash && (
                  <div className="timeline-commit">
                    <span className="commit-label">Commit:</span>
                    <code className="commit-hash">{mod.commitHash}</code>
                  </div>
                )}
                {mod.rollbackHash && (
                  <div className="timeline-rollback">
                    <span className="rollback-label">Rollback:</span>
                    <code className="rollback-hash">{mod.rollbackHash}</code>
                  </div>
                )}
                {mod.reason && (
                  <div className="timeline-reason">
                    <span className="reason-label">Reason:</span>
                    <span className="reason-text">{mod.reason}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="no-history glass">
            <span className="empty-icon">📜</span>
            <p>No modification history yet</p>
            <span className="empty-hint">Self-improvement modifications will appear here</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [currentView, setCurrentView] = useState<View>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [quickAssistOpen, setQuickAssistOpen] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('genesis-onboarding-complete');
  });
  const [unreadNotifications, setUnreadNotifications] = useState(3);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  // Advanced features state
  const [spaces, setSpaces] = useState<Space[]>(defaultSpaces);
  const [activeSpace, setActiveSpace] = useState('work');
  const [themeCustomizerOpen, setThemeCustomizerOpen] = useState(false);
  const [boostsPanelOpen, setBoostsPanelOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>({
    baseHue: 270,
    accentHue: 270,
    contrast: 'medium',
    mode: 'dark',
  });

  const { connected } = useGenesisStore();

  // Connect to Genesis
  const genesisUrl = import.meta.env.DEV ? '' : 'http://localhost:9876';
  useSSEConnection(genesisUrl);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
      // ⌘J for quick assist
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setQuickAssistOpen(prev => !prev);
      }
      // ⌘P for global search
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setGlobalSearchOpen(prev => !prev);
      }
      // ⌘E for code editor
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setCodeEditorOpen(prev => !prev);
      }
      // ⌘/ for docs
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setDocsOpen(prev => !prev);
      }
      // ? for shortcuts panel
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        setShortcutsOpen(prev => !prev);
      }
      // Number keys for navigation
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const viewIndex = parseInt(e.key) - 1;
        const views: View[] = ['overview', 'chat', 'agents', 'tasks', 'creator', 'terminal', 'analytics', 'files', 'memory'];
        if (viewIndex < views.length) {
          setCurrentView(views[viewIndex]);
        }
      }
      // ⌘T for theme customizer
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        setThemeCustomizerOpen(prev => !prev);
      }
      // ⌘B for boosts
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setBoostsPanelOpen(prev => !prev);
      }
      // ⌘\ for switching spaces
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        const currentIndex = spaces.findIndex(s => s.id === activeSpace);
        const nextIndex = (currentIndex + 1) % spaces.length;
        setActiveSpace(spaces[nextIndex].id);
      }
      // Escape to close
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setShortcutsOpen(false);
        setQuickAssistOpen(false);
        setGlobalSearchOpen(false);
        setCodeEditorOpen(false);
        setDocsOpen(false);
        setThemeCustomizerOpen(false);
        setBoostsPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Demo notification on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      addNotification('success', 'Sistema Pronto', 'Genesis è online e operativo');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const addNotification = (type: Notification['type'], title: string, message: string) => {
    const notif: Notification = {
      id: crypto.randomUUID(),
      type,
      title,
      message,
      timestamp: Date.now(),
    };
    setNotifications(prev => [...prev, notif]);

    // Auto dismiss after 5s
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    }, 5000);
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const navItems: { id: View; label: string; icon: React.FC; section?: string }[] = [
    // Genesis Core
    { id: 'overview', label: 'Overview', icon: Icons.overview, section: 'genesis' },
    { id: 'consciousness', label: 'Consciousness', icon: Icons.consciousness, section: 'genesis' },
    { id: 'neuromod', label: 'Neuromod', icon: Icons.neuromod, section: 'genesis' },
    { id: 'ness', label: 'NESS Economy', icon: Icons.ness, section: 'genesis' },
    // Active Inference & Predictive Processing
    { id: 'inference', label: 'Active Inference', icon: Icons.inference, section: 'inference' },
    { id: 'worldmodel', label: 'World Model', icon: Icons.worldmodel, section: 'inference' },
    { id: 'grounding', label: 'Grounding', icon: Icons.grounding, section: 'inference' },
    // Homeostasis & Pain
    { id: 'pain', label: 'Nociception', icon: Icons.pain, section: 'homeostasis' },
    { id: 'allostasis', label: 'Allostasis', icon: Icons.allostasis, section: 'homeostasis' },
    { id: 'healing', label: 'Healing', icon: Icons.healing, section: 'homeostasis' },
    // Self-Improvement
    { id: 'codemind', label: 'Code Mind', icon: Icons.codemind, section: 'evolution' },
    { id: 'evolution', label: 'Evolution', icon: Icons.evolution, section: 'evolution' },
    { id: 'sandbox', label: 'Sandbox', icon: Icons.sandbox, section: 'evolution' },
    { id: 'lessons', label: 'Lessons', icon: Icons.lessons, section: 'evolution' },
    { id: 'history', label: 'History', icon: Icons.modhistory, section: 'evolution' },
    // Operations
    { id: 'agents', label: 'Agents', icon: Icons.agents, section: 'ops' },
    { id: 'swarm', label: 'Swarm', icon: Icons.swarm, section: 'ops' },
    { id: 'daemon', label: 'Daemon', icon: Icons.daemon, section: 'ops' },
    { id: 'tasks', label: 'Tasks', icon: Icons.tasks, section: 'ops' },
    { id: 'memory', label: 'Memory', icon: Icons.memory, section: 'ops' },
    { id: 'mcp', label: 'MCP Hub', icon: Icons.mcp, section: 'ops' },
    // Finance & Revenue
    { id: 'finance', label: 'Finance', icon: Icons.finance, section: 'finance' },
    { id: 'revenue', label: 'Revenue', icon: Icons.revenue, section: 'finance' },
    { id: 'content', label: 'Content', icon: Icons.content, section: 'finance' },
    // Development
    { id: 'chat', label: 'Chat', icon: Icons.chat, section: 'dev' },
    { id: 'terminal', label: 'Terminal', icon: Icons.terminal, section: 'dev' },
    { id: 'files', label: 'Files', icon: Icons.files, section: 'dev' },
    { id: 'playground', label: 'Playground', icon: Icons.playground, section: 'dev' },
    // More
    { id: 'analytics', label: 'Analytics', icon: Icons.analytics, section: 'more' },
    { id: 'creator', label: 'Creator', icon: Icons.creator, section: 'more' },
    { id: 'workflow', label: 'Workflow', icon: Icons.workflow, section: 'more' },
    { id: 'integrations', label: 'Integrations', icon: Icons.integrations, section: 'more' },
    { id: 'marketplace', label: 'Marketplace', icon: Icons.marketplace, section: 'more' },
    { id: 'settings', label: 'Settings', icon: Icons.settings, section: 'more' },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview': return <EnhancedOverview />;
      case 'consciousness': return <ConsciousnessControlCenter />;
      case 'neuromod': return <NeuromodulationDashboard />;
      case 'ness': return <NESSEconomicDashboard />;
      case 'chat': return <ChatView />;
      case 'agents': return <AgentsView />;
      case 'tasks': return <TasksView />;
      case 'creator': return <CreatorView />;
      case 'terminal': return <TerminalView />;
      case 'analytics': return <AnalyticsView />;
      case 'files': return <FilesView />;
      case 'memory': return <MemoryView />;
      case 'workflow': return <WorkflowView />;
      case 'playground': return <PlaygroundView />;
      case 'integrations': return <IntegrationsView />;
      case 'marketplace': return <MarketplaceView />;
      case 'mcp': return <MCPHubView />;
      case 'settings': return <SettingsView />;
      case 'codemind': return <CodeMindView />;
      case 'evolution': return <EvolutionView />;
      case 'sandbox': return <SandboxMonitorView />;
      case 'lessons': return <LessonsView />;
      case 'history': return <HistoryView />;
      case 'inference': return <ActiveInferenceView />;
      case 'pain': return <NociceptionView />;
      case 'allostasis': return <AllostasisView />;
      case 'worldmodel': return <WorldModelView />;
      case 'daemon': return <DaemonView />;
      case 'finance': return <FinanceView />;
      case 'revenue': return <RevenueView />;
      case 'content': return <ContentView />;
      case 'swarm': return <SwarmView />;
      case 'healing': return <HealingView />;
      case 'grounding': return <GroundingView />;
      default: return <OverviewView />;
    }
  };

  return (
    <div className="genesis-app">
      {/* Command Palette */}
      <AnimatePresence>
        {commandPaletteOpen && (
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            onNavigate={setCurrentView}
          />
        )}
      </AnimatePresence>

      {/* Notifications */}
      <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />

      {/* Shortcuts Panel */}
      <AnimatePresence>
        {shortcutsOpen && (
          <ShortcutsPanel isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        )}
      </AnimatePresence>

      {/* Quick AI Assistant */}
      <AnimatePresence>
        {quickAssistOpen && (
          <QuickAssistant isOpen={quickAssistOpen} onClose={() => setQuickAssistOpen(false)} />
        )}
      </AnimatePresence>

      {/* Global Search */}
      <AnimatePresence>
        {globalSearchOpen && (
          <GlobalSearch
            isOpen={globalSearchOpen}
            onClose={() => setGlobalSearchOpen(false)}
            onNavigate={setCurrentView}
          />
        )}
      </AnimatePresence>

      {/* Code Editor */}
      <AnimatePresence>
        {codeEditorOpen && (
          <CodeEditor isOpen={codeEditorOpen} onClose={() => setCodeEditorOpen(false)} />
        )}
      </AnimatePresence>

      {/* Docs Viewer */}
      <AnimatePresence>
        {docsOpen && (
          <DocsViewer isOpen={docsOpen} onClose={() => setDocsOpen(false)} />
        )}
      </AnimatePresence>

      {/* Onboarding */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingFlow
            isOpen={showOnboarding}
            onComplete={() => {
              setShowOnboarding(false);
              localStorage.setItem('genesis-onboarding-complete', 'true');
            }}
          />
        )}
      </AnimatePresence>

      {/* Theme Customizer */}
      <AnimatePresence>
        {themeCustomizerOpen && (
          <ThemeCustomizer
            isOpen={themeCustomizerOpen}
            onClose={() => setThemeCustomizerOpen(false)}
            onApply={(config) => {
              setCurrentTheme(config);
              // Apply theme CSS variables
              const themeVars = generateTheme(config);
              Object.entries(themeVars).forEach(([key, value]) => {
                document.documentElement.style.setProperty(key, value as string);
              });
              setThemeCustomizerOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Boosts Panel */}
      <AnimatePresence>
        {boostsPanelOpen && (
          <BoostsPanel
            isOpen={boostsPanelOpen}
            onClose={() => setBoostsPanelOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-orb" />
            {!sidebarCollapsed && <span className="logo-text">GENESIS</span>}
          </div>
        </div>

        {/* Spaces Switcher */}
        {!sidebarCollapsed && (
          <SpaceSwitcher
            spaces={spaces}
            activeSpace={activeSpace}
            onSwitch={setActiveSpace}
            onAddSpace={() => {
              const newSpace: Space = {
                id: `space-${Date.now()}`,
                name: 'New Space',
                color: '#' + Math.floor(Math.random()*16777215).toString(16),
                icon: '📁',
                tabs: ['overview'],
                isActive: false,
              };
              setSpaces(prev => [...prev, newSpace]);
            }}
          />
        )}

        {/* Search / Command Palette trigger */}
        {!sidebarCollapsed && (
          <button className="search-trigger" onClick={() => setCommandPaletteOpen(true)}>
            <Icons.search />
            <span>Search...</span>
            <span className="shortcut">⌘K</span>
          </button>
        )}

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => setCurrentView(item.id)}
              title={item.label}
            >
              <item.icon />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <ThemeToggle isDark={isDarkTheme} onToggle={() => setIsDarkTheme(!isDarkTheme)} />
          <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
          {!sidebarCollapsed && (
            <span className="status-text">{connected ? 'Online' : 'Offline'}</span>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${isDarkTheme ? 'dark' : 'light'}`}>
        {/* Top Bar */}
        <div className="top-bar">
          <LiveCollaborators />
          <div className="top-bar-actions">
            <button
              className="top-bar-btn"
              onClick={() => setGlobalSearchOpen(true)}
              title="Global Search (⌘P)"
            >
              🔍
            </button>
            <button
              className="top-bar-btn"
              onClick={() => setCodeEditorOpen(true)}
              title="Code Editor (⌘E)"
            >
              ✏️
            </button>
            <button
              className="top-bar-btn"
              onClick={() => setDocsOpen(true)}
              title="Documentation (⌘/)"
            >
              📚
            </button>
            <VoiceCommand
              isListening={isVoiceListening}
              onToggle={() => setIsVoiceListening(!isVoiceListening)}
            />
            <button
              className="top-bar-btn theme-btn"
              onClick={() => setThemeCustomizerOpen(true)}
              title="Theme Studio (⌘T)"
            >
              🎨
            </button>
            <button
              className="top-bar-btn boosts-btn"
              onClick={() => setBoostsPanelOpen(true)}
              title="Boosts (⌘B)"
            >
              ⚡
            </button>
            <button
              className="shortcuts-btn"
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard Shortcuts (?)"
            >
              ⌨
            </button>
            <button
              className="assist-btn"
              onClick={() => setQuickAssistOpen(true)}
              title="Quick AI Assist (⌘J)"
            >
              🧠
            </button>
            <NotificationBell
              count={unreadNotifications}
              onClick={() => setUnreadNotifications(0)}
            />
            <UserProfile />
          </div>
        </div>

        {/* Ambient background */}
        <div className="ambient-bg">
          <div className="ambient-orb orb-1" />
          <div className="ambient-orb orb-2" />
          <div className="grid-pattern" />
        </div>

        <Breadcrumbs currentView={currentView} />

        <div className="content-layout">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="view-container"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>

          {/* Right Sidebar - Only on Overview */}
          {currentView === 'overview' && (
            <aside className="right-sidebar">
              <SystemHealth />
              <PerformanceMonitor />
              <ActivityFeed />
            </aside>
          )}
        </div>

        {/* Quick Actions FAB */}
        <div className="quick-actions">
          <motion.button
            className="fab-main"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Icons.command />
          </motion.button>
        </div>
      </main>

      <style>{`
        /* ============================================
           GENESIS - Full Interactive Interface
           ============================================ */

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        :root {
          /* Vercel-inspired Premium Dark Theme */
          --bg-primary: #000000;
          --bg-secondary: #0a0a0a;
          --bg-card: #111111;
          --bg-hover: #171717;
          --bg-elevated: #1a1a1a;
          --border-color: rgba(255, 255, 255, 0.08);
          --border-subtle: rgba(255, 255, 255, 0.04);

          /* Typography */
          --text-primary: #fafafa;
          --text-secondary: #a1a1aa;
          --text-muted: #52525b;
          --text-accent: #ededed;

          /* Accent Colors - Genesis Consciousness Theme */
          --accent-purple: #a855f7;
          --accent-violet: #8b5cf6;
          --accent-cyan: #22d3ee;
          --accent-green: #22c55e;
          --accent-yellow: #eab308;
          --accent-orange: #f97316;
          --accent-red: #ef4444;
          --accent-blue: #3b82f6;
          --accent-pink: #ec4899;

          /* Genesis-specific colors */
          --phi-color: #c084fc;
          --dopamine-color: #22c55e;
          --serotonin-color: #3b82f6;
          --norepinephrine-color: #eab308;
          --cortisol-color: #ef4444;

          /* Glassmorphism */
          --glass-bg: rgba(17, 17, 17, 0.7);
          --glass-border: rgba(255, 255, 255, 0.1);
          --glass-blur: 20px;

          /* Shadows */
          --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
          --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
          --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.5);
          --shadow-glow: 0 0 40px rgba(168, 85, 247, 0.15);

          /* Transitions */
          --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
          --transition-normal: 200ms cubic-bezier(0.4, 0, 0.2, 1);
          --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);

          /* Spacing scale */
          --space-1: 4px;
          --space-2: 8px;
          --space-3: 12px;
          --space-4: 16px;
          --space-5: 20px;
          --space-6: 24px;
          --space-8: 32px;
          --space-10: 40px;

          /* Border radius */
          --radius-sm: 6px;
          --radius-md: 8px;
          --radius-lg: 12px;
          --radius-xl: 16px;
          --radius-2xl: 20px;
          --radius-full: 9999px;
        }

        .genesis-app {
          width: 100vw;
          height: 100vh;
          display: flex;
          background: var(--bg-primary);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: var(--text-primary);
          overflow: hidden;
        }

        /* Sidebar */
        .sidebar {
          width: 240px;
          height: 100%;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          transition: width 0.3s ease;
        }

        .sidebar.collapsed {
          width: 64px;
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-orb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #c084fc, var(--accent-purple));
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
          animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.4); }
          50% { box-shadow: 0 0 30px rgba(168, 85, 247, 0.6); }
        }

        .logo-text {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.15em;
        }

        .search-trigger {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 12px 12px 0;
          padding: 10px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .search-trigger:hover {
          border-color: var(--accent-purple);
          color: var(--text-secondary);
        }

        .search-trigger .shortcut {
          margin-left: auto;
          font-size: 11px;
          padding: 2px 6px;
          background: var(--bg-secondary);
          border-radius: 4px;
        }

        .sidebar-nav {
          flex: 1;
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: rgba(168, 85, 247, 0.15);
          color: var(--accent-purple);
        }

        .nav-item span:first-child {
          font-size: 18px;
          width: 24px;
          text-align: center;
        }

        .sidebar-footer {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.online {
          background: var(--accent-green);
          box-shadow: 0 0 8px var(--accent-green);
        }

        .status-dot.offline {
          background: var(--accent-red);
        }

        .status-text {
          font-size: 12px;
          color: var(--text-muted);
        }

        /* Main Content */
        .main-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .ambient-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .ambient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.08;
        }

        .ambient-orb.orb-1 {
          width: 600px;
          height: 600px;
          background: var(--accent-purple);
          top: -200px;
          right: -200px;
          animation: float-orb 30s ease-in-out infinite;
        }

        .ambient-orb.orb-2 {
          width: 500px;
          height: 500px;
          background: var(--accent-cyan);
          bottom: -150px;
          left: -150px;
          animation: float-orb 25s ease-in-out infinite reverse;
        }

        @keyframes float-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(50px, 30px) scale(1.05); }
          66% { transform: translate(-30px, 50px) scale(0.95); }
        }

        .grid-pattern {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(168, 85, 247, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168, 85, 247, 0.02) 1px, transparent 1px);
          background-size: 50px 50px;
          mask-image: radial-gradient(ellipse at center, transparent 0%, black 100%);
        }

        .view-container {
          flex: 1;
          overflow: auto;
          padding: 24px;
          position: relative;
          z-index: 1;
        }

        /* Quick Actions FAB */
        .quick-actions {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 100;
        }

        .fab-main {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 30px rgba(168, 85, 247, 0.4);
        }

        .fab-main:hover {
          box-shadow: 0 12px 40px rgba(168, 85, 247, 0.5);
        }

        .view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .view-header h2 {
          font-size: 24px;
          font-weight: 600;
        }

        /* Overview Cards */
        .overview-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .overview-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-header h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .state-badge, .mode-badge {
          font-size: 11px;
          padding: 4px 10px;
          background: rgba(168, 85, 247, 0.15);
          color: var(--accent-purple);
          border-radius: 4px;
          text-transform: uppercase;
        }

        .phi-display {
          text-align: center;
          margin-bottom: 16px;
        }

        .phi-symbol {
          font-size: 20px;
          color: var(--text-muted);
          margin-right: 8px;
        }

        .phi-value {
          font-size: 36px;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .mini-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .mini-stat {
          text-align: center;
        }

        .mini-stat .label {
          font-size: 11px;
          color: var(--text-muted);
          display: block;
          margin-bottom: 4px;
        }

        .mini-stat .value {
          font-size: 18px;
          font-weight: 600;
        }

        .agents-summary {
          text-align: center;
          margin-bottom: 16px;
        }

        .agent-count {
          font-size: 48px;
          font-weight: 700;
          color: var(--accent-green);
        }

        .agent-label {
          font-size: 14px;
          color: var(--text-muted);
        }

        .providers-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .provider-tag {
          font-size: 11px;
          padding: 4px 8px;
          background: rgba(6, 182, 212, 0.15);
          color: var(--accent-cyan);
          border-radius: 4px;
        }

        .cost-display {
          text-align: center;
          margin-bottom: 16px;
        }

        .cost-display .currency {
          font-size: 18px;
          color: var(--text-muted);
        }

        .cost-display .amount {
          font-size: 32px;
          font-weight: 700;
        }

        .data-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .data-badge.real {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .data-badge.demo {
          background: rgba(245, 158, 11, 0.15);
          color: var(--accent-orange);
        }

        .ness-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .ness-fill {
          height: 100%;
          background: var(--accent-green);
          border-radius: 3px;
        }

        .ness-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .memory-bars {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .memory-row {
          display: grid;
          grid-template-columns: 80px 1fr 40px;
          align-items: center;
          gap: 12px;
        }

        .memory-row .type {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .memory-row .bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .memory-row .fill {
          height: 100%;
          border-radius: 3px;
        }

        .memory-row .fill.episodic { background: var(--accent-orange); }
        .memory-row .fill.semantic { background: var(--accent-blue); }
        .memory-row .fill.procedural { background: var(--accent-green); }

        .memory-row .count {
          font-size: 12px;
          text-align: right;
          color: var(--text-primary);
        }

        .kernel-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .kernel-stat .label {
          font-size: 11px;
          color: var(--text-muted);
          display: block;
          margin-bottom: 4px;
        }

        .kernel-stat .value {
          font-size: 16px;
          font-weight: 600;
        }

        .kernel-levels {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .kernel-levels .level {
          display: grid;
          grid-template-columns: 24px 1fr;
          align-items: center;
          gap: 8px;
          opacity: 0.4;
        }

        .kernel-levels .level.active {
          opacity: 1;
        }

        .kernel-levels .level-id {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .kernel-levels .level-bar {
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .kernel-levels .level-fill {
          height: 100%;
          background: var(--accent-purple);
          border-radius: 2px;
        }

        .events-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .event-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 6px;
        }

        .event-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-purple);
        }

        .event-type {
          flex: 1;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .event-time {
          font-size: 11px;
          color: var(--text-muted);
        }

        .event-count {
          font-size: 12px;
          padding: 2px 8px;
          background: rgba(168, 85, 247, 0.15);
          color: var(--accent-purple);
          border-radius: 10px;
        }

        .no-events {
          text-align: center;
          padding: 20px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .connection-status {
          font-size: 12px;
          padding: 6px 12px;
          border-radius: 6px;
        }

        .connection-status.connected {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .connection-status.disconnected {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-red);
        }

        /* Chat View */
        .chat-view {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 48px);
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 16px;
        }

        .chat-header h2 {
          font-size: 20px;
          font-weight: 600;
        }

        .chat-status {
          font-size: 12px;
          color: var(--accent-green);
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .chat-message {
          max-width: 80%;
          padding: 12px 16px;
          border-radius: 12px;
        }

        .chat-message.user {
          align-self: flex-end;
          background: var(--accent-purple);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .chat-message.assistant,
        .chat-message.system {
          align-self: flex-start;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-bottom-left-radius: 4px;
        }

        .message-agent {
          font-size: 10px;
          color: var(--accent-purple);
          margin-bottom: 4px;
          display: block;
          text-transform: uppercase;
        }

        .message-content {
          font-size: 14px;
          line-height: 1.5;
        }

        .message-time {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 6px;
          display: block;
        }

        .chat-message.user .message-time {
          color: rgba(255, 255, 255, 0.7);
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 4px;
        }

        .typing-indicator span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }

        .chat-input-container {
          display: flex;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .chat-input-container textarea {
          flex: 1;
          padding: 14px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 14px;
          resize: none;
          font-family: inherit;
        }

        .chat-input-container textarea:focus {
          outline: none;
          border-color: var(--accent-purple);
        }

        .chat-input-container button {
          width: 48px;
          height: 48px;
          background: var(--accent-purple);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .chat-input-container button:hover:not(:disabled) {
          background: #9333ea;
        }

        .chat-input-container button:disabled {
          background: var(--bg-hover);
          color: var(--text-muted);
          cursor: not-allowed;
        }

        /* Agents View */
        .agents-view {
          display: flex;
          flex-direction: column;
        }

        .header-stats {
          display: flex;
          gap: 16px;
        }

        .header-stats .stat {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .agents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .agent-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .agent-card.running {
          border-color: rgba(16, 185, 129, 0.3);
        }

        .agent-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }

        .agent-card .agent-icon {
          font-size: 24px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-hover);
          border-radius: 10px;
        }

        .agent-card.running .agent-icon {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .agent-info {
          flex: 1;
        }

        .agent-info h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .agent-type {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: capitalize;
        }

        .status-badge {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 4px;
        }

        .status-badge.idle {
          background: rgba(113, 113, 122, 0.2);
          color: var(--text-muted);
        }

        .status-badge.running {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .status-badge.error {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-red);
        }

        .agent-task {
          padding: 12px;
          background: var(--bg-hover);
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .task-label {
          font-size: 11px;
          color: var(--text-muted);
          display: block;
          margin-bottom: 4px;
        }

        .task-text {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .agent-actions {
          display: flex;
          gap: 8px;
        }

        .agent-actions button {
          flex: 1;
          padding: 10px 16px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .agent-actions button:hover {
          background: var(--bg-hover);
        }

        .agent-actions button.start {
          background: rgba(16, 185, 129, 0.15);
          border-color: rgba(16, 185, 129, 0.3);
          color: var(--accent-green);
        }

        .agent-actions button.stop {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
          color: var(--accent-red);
        }

        /* Tasks View */
        .tasks-view {
          display: flex;
          flex-direction: column;
        }

        .primary-btn {
          padding: 10px 20px;
          background: var(--accent-purple);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .primary-btn:hover {
          background: #9333ea;
        }

        .new-task-form {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .new-task-form input,
        .new-task-form textarea,
        .new-task-form select {
          width: 100%;
          padding: 12px 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px;
          font-family: inherit;
        }

        .new-task-form textarea {
          resize: none;
          min-height: 80px;
        }

        .new-task-form input:focus,
        .new-task-form textarea:focus,
        .new-task-form select:focus {
          outline: none;
          border-color: var(--accent-purple);
        }

        .form-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .form-row select {
          width: auto;
        }

        .form-actions {
          display: flex;
          gap: 8px;
          margin-left: auto;
        }

        .form-actions button {
          padding: 10px 20px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .form-actions button:hover {
          background: var(--bg-hover);
        }

        .form-actions button.primary {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }

        .tasks-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .task-card {
          display: flex;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
        }

        .task-priority {
          width: 4px;
        }

        .task-content {
          flex: 1;
          padding: 16px 20px;
        }

        .task-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .task-header h3 {
          font-size: 15px;
          font-weight: 600;
        }

        .task-status {
          font-size: 12px;
          font-weight: 500;
        }

        .task-description {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 12px;
          line-height: 1.4;
        }

        .task-meta {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .task-agent {
          color: var(--accent-purple);
        }

        .task-reward {
          color: var(--accent-green);
        }

        .task-time {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .task-actions {
          padding: 16px;
          display: flex;
          align-items: center;
        }

        .task-actions button {
          padding: 8px 16px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .task-actions button:hover {
          background: var(--bg-hover);
        }

        /* Memory View */
        .memory-view {
          display: flex;
          flex-direction: column;
        }

        .memory-stats {
          display: flex;
          gap: 16px;
        }

        .memory-stats .stat {
          font-size: 13px;
        }

        .memory-stats .stat.episodic { color: var(--accent-orange); }
        .memory-stats .stat.semantic { color: var(--accent-blue); }
        .memory-stats .stat.procedural { color: var(--accent-green); }

        .memory-filters {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .search-box {
          flex: 1;
          min-width: 250px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }

        .search-box input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 14px;
        }

        .search-box input:focus {
          outline: none;
        }

        .search-box input::placeholder {
          color: var(--text-muted);
        }

        .type-filters {
          display: flex;
          gap: 8px;
        }

        .type-filters button {
          padding: 10px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .type-filters button:hover {
          background: var(--bg-hover);
        }

        .type-filters button.active {
          background: rgba(168, 85, 247, 0.15);
          border-color: var(--accent-purple);
          color: var(--accent-purple);
        }

        .memory-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .memory-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px 20px;
        }

        .memory-type-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 4px;
          color: white;
          margin-bottom: 12px;
        }

        .memory-content {
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 12px;
        }

        .memory-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .memory-tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .memory-tags .tag {
          font-size: 11px;
          color: var(--text-muted);
          padding: 4px 8px;
          background: var(--bg-hover);
          border-radius: 4px;
        }

        .memory-info {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .memory-info .relevance {
          color: var(--accent-green);
        }

        /* Settings View */
        .settings-view {
          display: flex;
          flex-direction: column;
          max-width: 800px;
        }

        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-section {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .settings-section h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .setting-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .setting-item:last-child {
          margin-bottom: 0;
        }

        .setting-item label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .setting-item.toggle-item {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
        }

        .input-group {
          display: flex;
          gap: 8px;
        }

        .input-group input {
          flex: 1;
          padding: 10px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px;
        }

        .input-group button,
        .add-mcp {
          padding: 10px 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .input-group button:hover,
        .add-mcp:hover {
          background: var(--bg-primary);
        }

        .settings-section select {
          padding: 10px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px;
        }

        .mcp-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .mcp-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: var(--bg-hover);
          border-radius: 8px;
        }

        .mcp-item .mcp-name {
          font-size: 14px;
          text-transform: capitalize;
        }

        .toggle {
          position: relative;
          width: 44px;
          height: 24px;
          cursor: pointer;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          inset: 0;
          background: var(--bg-primary);
          border-radius: 12px;
          transition: background 0.3s;
        }

        .toggle-slider::before {
          content: '';
          position: absolute;
          width: 18px;
          height: 18px;
          left: 3px;
          bottom: 3px;
          background: var(--text-muted);
          border-radius: 50%;
          transition: transform 0.3s, background 0.3s;
        }

        .toggle input:checked + .toggle-slider {
          background: var(--accent-purple);
        }

        .toggle input:checked + .toggle-slider::before {
          transform: translateX(20px);
          background: white;
        }

        /* Terminal View */
        .terminal-view {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 48px);
        }

        .terminal-filters {
          display: flex;
          gap: 6px;
        }

        .filter-btn {
          padding: 6px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-muted);
          font-size: 11px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          background: var(--bg-hover);
        }

        .filter-btn.active {
          background: rgba(168, 85, 247, 0.15);
          border-color: var(--accent-purple);
          color: var(--accent-purple);
        }

        .terminal-output {
          flex: 1;
          background: #0d0d12;
          border-radius: 12px;
          padding: 16px;
          font-family: 'JetBrains Mono', 'SF Mono', monospace;
          font-size: 12px;
          overflow-y: auto;
          margin-bottom: 12px;
        }

        .log-line {
          display: flex;
          gap: 12px;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .log-time {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .log-source {
          color: var(--accent-cyan);
          flex-shrink: 0;
          min-width: 100px;
        }

        .log-level {
          flex-shrink: 0;
          min-width: 60px;
          font-weight: 600;
        }

        .log-message {
          color: var(--text-secondary);
        }

        .terminal-input {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: #0d0d12;
          border-radius: 12px;
          font-family: 'JetBrains Mono', monospace;
        }

        .terminal-prompt {
          color: var(--accent-green);
          font-weight: 600;
        }

        .terminal-input input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 13px;
        }

        .terminal-input input:focus {
          outline: none;
        }

        /* Analytics View */
        .analytics-view {
          display: flex;
          flex-direction: column;
        }

        .time-range-selector {
          display: flex;
          gap: 6px;
        }

        .range-btn {
          padding: 8px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .range-btn:hover {
          background: var(--bg-hover);
        }

        .range-btn.active {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }

        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .analytics-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .analytics-card.summary {
          text-align: center;
        }

        .analytics-card h3 {
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .big-number {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .comparison {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 4px;
          display: inline-block;
        }

        .comparison.up {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .comparison.down {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-red);
        }

        .comparison.stable {
          background: rgba(113, 113, 122, 0.2);
          color: var(--text-muted);
        }

        .analytics-card.chart-card {
          grid-column: span 2;
        }

        .bar-chart {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          height: 150px;
          gap: 8px;
        }

        .bar-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .bar-wrapper {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: flex-end;
        }

        .bar {
          width: 100%;
          background: linear-gradient(180deg, var(--accent-purple), var(--accent-blue));
          border-radius: 4px 4px 0 0;
          min-height: 4px;
        }

        .bar-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        .bar-value {
          font-size: 10px;
          color: var(--text-secondary);
        }

        .provider-card {
          grid-column: span 2;
        }

        .provider-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .provider-row {
          display: grid;
          grid-template-columns: 1fr 2fr 50px;
          align-items: center;
          gap: 12px;
        }

        .provider-info {
          display: flex;
          justify-content: space-between;
        }

        .provider-name {
          font-size: 13px;
          font-weight: 500;
        }

        .provider-cost {
          font-size: 12px;
          color: var(--text-muted);
        }

        .provider-bar {
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .provider-fill {
          height: 100%;
          border-radius: 4px;
        }

        .provider-percentage {
          font-size: 12px;
          font-weight: 600;
          text-align: right;
        }

        .agent-usage-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .agent-usage-row {
          display: grid;
          grid-template-columns: 80px 1fr 60px;
          align-items: center;
          gap: 12px;
        }

        .agent-usage-name {
          font-size: 13px;
        }

        .agent-usage-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .agent-usage-fill {
          height: 100%;
          background: var(--accent-purple);
          border-radius: 3px;
        }

        .agent-usage-tasks {
          font-size: 11px;
          color: var(--text-muted);
          text-align: right;
        }

        /* Files View */
        .files-view {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 48px);
        }

        .file-actions {
          display: flex;
          gap: 8px;
        }

        .file-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .file-action-btn:hover {
          background: var(--bg-hover);
        }

        .files-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 16px;
          overflow: hidden;
        }

        .file-tree {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .tree-header {
          padding: 12px 16px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          border-bottom: 1px solid var(--border-color);
        }

        .tree-content {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .file-node {
          user-select: none;
        }

        .file-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .file-row:hover {
          background: var(--bg-hover);
        }

        .file-node.selected > .file-row,
        .file-row.selected {
          background: rgba(168, 85, 247, 0.15);
        }

        .file-icon {
          font-size: 14px;
          flex-shrink: 0;
        }

        .file-name {
          flex: 1;
          font-size: 13px;
        }

        .file-size {
          font-size: 11px;
          color: var(--text-muted);
        }

        .file-modified {
          font-size: 11px;
          color: var(--text-muted);
        }

        .folder-arrow {
          font-size: 10px;
          color: var(--text-muted);
        }

        .folder-children {
          padding-left: 20px;
        }

        .file-preview {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .preview-path {
          font-size: 12px;
          color: var(--text-secondary);
          font-family: 'JetBrains Mono', monospace;
        }

        .preview-actions {
          display: flex;
          gap: 8px;
        }

        .preview-actions button {
          padding: 6px 12px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
        }

        .preview-content {
          flex: 1;
          overflow: auto;
          padding: 16px;
        }

        .code-preview {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0;
        }

        .preview-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-muted);
        }

        .preview-empty-icon {
          font-size: 48px;
          opacity: 0.5;
        }

        /* Command Palette */
        .command-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 999;
        }

        .command-palette {
          position: fixed;
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          z-index: 1000;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .command-input-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .command-input-wrapper input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 16px;
        }

        .command-input-wrapper input:focus {
          outline: none;
        }

        .command-shortcut {
          font-size: 11px;
          padding: 4px 8px;
          background: var(--bg-hover);
          border-radius: 4px;
          color: var(--text-muted);
        }

        .command-results {
          max-height: 400px;
          overflow-y: auto;
        }

        .command-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 20px;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
          text-align: left;
        }

        .command-item:hover {
          background: var(--bg-hover);
        }

        .command-icon {
          font-size: 18px;
          width: 28px;
          text-align: center;
        }

        .command-label {
          flex: 1;
        }

        .command-category {
          font-size: 11px;
          color: var(--text-muted);
          padding: 4px 8px;
          background: var(--bg-secondary);
          border-radius: 4px;
        }

        /* Notifications */
        .notification-center {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1001;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 360px;
        }

        .notification {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .notification.success {
          border-left: 3px solid var(--accent-green);
        }

        .notification.info {
          border-left: 3px solid var(--accent-blue);
        }

        .notification.warning {
          border-left: 3px solid var(--accent-orange);
        }

        .notification.error {
          border-left: 3px solid var(--accent-red);
        }

        .notification-content {
          flex: 1;
        }

        .notification-content strong {
          display: block;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .notification-content p {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
        }

        .notification-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
        }

        .notification-close:hover {
          color: var(--text-primary);
        }

        /* Creator View */
        .creator-view {
          display: flex;
          flex-direction: column;
        }

        .new-creation-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 600px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
          z-index: 1000;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 999;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-header h3 {
          font-size: 18px;
          font-weight: 600;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 20px;
          border-radius: 6px;
        }

        .close-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .creation-types {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }

        .type-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 12px;
          background: var(--bg-hover);
          border: 2px solid transparent;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .type-option:hover {
          background: var(--bg-secondary);
        }

        .type-option.selected {
          border-color: var(--accent-purple);
          background: rgba(168, 85, 247, 0.1);
        }

        .type-icon {
          font-size: 28px;
        }

        .type-label {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .creation-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .creation-form input,
        .creation-form textarea {
          width: 100%;
          padding: 14px 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 14px;
          font-family: inherit;
        }

        .creation-form textarea {
          resize: none;
        }

        .creation-form input:focus,
        .creation-form textarea:focus {
          outline: none;
          border-color: var(--accent-purple);
        }

        .creation-templates {
          margin-bottom: 32px;
        }

        .creation-templates h3,
        .creations-section h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text-secondary);
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }

        .template-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .template-card:hover {
          border-color: var(--accent-purple);
          background: rgba(168, 85, 247, 0.05);
          transform: translateY(-2px);
        }

        .template-icon {
          font-size: 32px;
        }

        .template-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .template-desc {
          font-size: 12px;
          color: var(--text-muted);
        }

        .creations-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .creation-card {
          display: flex;
          gap: 16px;
          padding: 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }

        .creation-card.generating {
          border-color: rgba(59, 130, 246, 0.3);
        }

        .creation-card.completed {
          border-color: rgba(16, 185, 129, 0.2);
        }

        .creation-icon {
          font-size: 32px;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-hover);
          border-radius: 12px;
          flex-shrink: 0;
        }

        .creation-content {
          flex: 1;
          min-width: 0;
        }

        .creation-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }

        .creation-header h4 {
          font-size: 15px;
          font-weight: 600;
        }

        .creation-status {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .creation-status.completed {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .creation-status.generating {
          background: rgba(59, 130, 246, 0.15);
          color: var(--accent-blue);
        }

        .creation-status.draft {
          background: rgba(113, 113, 122, 0.2);
          color: var(--text-muted);
        }

        .creation-status.error {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-red);
        }

        .creation-desc {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 12px;
          line-height: 1.4;
        }

        .creation-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .creation-progress .progress-bar {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .creation-progress .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
          border-radius: 3px;
        }

        .creation-progress .progress-text {
          font-size: 12px;
          color: var(--accent-blue);
          font-weight: 600;
          min-width: 40px;
        }

        .creation-meta {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .creation-type {
          color: var(--accent-purple);
        }

        .creation-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
        }

        .action-btn {
          padding: 8px 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .action-btn:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .action-btn.cancel {
          color: var(--accent-red);
          border-color: rgba(239, 68, 68, 0.3);
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        /* ============================================
           TOP BAR & COLLABORATORS
           ============================================ */

        .top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px;
          position: relative;
          z-index: 10;
        }

        .live-collaborators {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .collab-avatars {
          display: flex;
          align-items: center;
        }

        .collab-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: white;
          border: 2px solid var(--bg-primary);
          cursor: pointer;
        }

        .collab-more {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg-hover);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: var(--text-muted);
          margin-left: -8px;
          border: 2px solid var(--bg-primary);
        }

        .collab-label {
          font-size: 11px;
          color: var(--accent-green);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .collab-label::before {
          content: '';
          width: 6px;
          height: 6px;
          background: var(--accent-green);
          border-radius: 50%;
          animation: pulse-live 2s infinite;
        }

        @keyframes pulse-live {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .top-bar-actions {
          display: flex;
          gap: 8px;
        }

        .top-bar-btn,
        .shortcuts-btn,
        .assist-btn {
          width: 36px;
          height: 36px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .top-bar-btn:hover,
        .shortcuts-btn:hover,
        .assist-btn:hover {
          background: var(--bg-hover);
          border-color: var(--accent-purple);
        }

        /* ============================================
           GLOBAL SEARCH
           ============================================ */

        .global-search-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 200;
          backdrop-filter: blur(4px);
        }

        .global-search {
          position: fixed;
          top: 15%;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 640px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          z-index: 201;
          overflow: hidden;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
        }

        .search-input-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .search-input-container input {
          flex: 1;
          background: transparent;
          border: none;
          font-size: 16px;
          color: var(--text-primary);
        }

        .search-input-container input:focus {
          outline: none;
        }

        .search-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-purple);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .search-results {
          max-height: 400px;
          overflow-y: auto;
        }

        .no-results {
          padding: 32px;
          text-align: center;
          color: var(--text-muted);
        }

        .search-result {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 20px;
          cursor: pointer;
          transition: background 0.1s;
        }

        .search-result:hover,
        .search-result.selected {
          background: var(--bg-hover);
        }

        .result-icon {
          font-size: 20px;
        }

        .result-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .result-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .result-desc {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .result-path {
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'SF Mono', monospace;
        }

        .result-type {
          padding: 3px 8px;
          background: var(--bg-secondary);
          border-radius: 4px;
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .search-hints {
          padding: 16px 20px;
        }

        .hint-section {
          margin-bottom: 16px;
        }

        .hint-label {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .hint-actions {
          display: flex;
          gap: 8px;
        }

        .hint-actions button {
          padding: 6px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
        }

        .hint-actions button:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .recent-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .recent-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        }

        .recent-item:hover {
          background: var(--bg-hover);
        }

        /* ============================================
           PERFORMANCE MONITOR
           ============================================ */

        .perf-monitor {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
        }

        .perf-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
        }

        .perf-title {
          font-size: 13px;
          font-weight: 600;
        }

        .perf-toggle {
          font-size: 10px;
          color: var(--text-muted);
        }

        .perf-content {
          padding: 0 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .perf-graph {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .graph-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }

        .graph-label {
          color: var(--text-muted);
        }

        .graph-value {
          font-weight: 600;
          font-family: 'SF Mono', monospace;
        }

        .perf-graph svg {
          height: 40px;
          width: 100%;
        }

        /* ============================================
           CODE EDITOR
           ============================================ */

        .editor-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 200;
        }

        .code-editor-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 1000px;
          height: 80vh;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          z-index: 201;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
        }

        .editor-tabs {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .editor-tab {
          padding: 6px 14px;
          background: var(--bg-card);
          border-radius: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .editor-tab.active {
          background: var(--accent-purple);
          color: white;
        }

        .new-tab {
          width: 24px;
          height: 24px;
          background: transparent;
          border: 1px dashed var(--border-color);
          border-radius: 4px;
          color: var(--text-muted);
          cursor: pointer;
        }

        .editor-actions {
          display: flex;
          gap: 10px;
        }

        .run-btn {
          padding: 8px 16px;
          background: var(--accent-green);
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .run-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .editor-body {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 300px;
          min-height: 0;
        }

        .editor-main {
          display: flex;
          overflow: hidden;
        }

        .line-numbers {
          padding: 16px 12px;
          background: var(--bg-primary);
          display: flex;
          flex-direction: column;
          font-family: 'SF Mono', monospace;
          font-size: 13px;
          color: var(--text-muted);
          text-align: right;
          user-select: none;
        }

        .line-numbers span {
          line-height: 1.5;
        }

        .editor-main textarea {
          flex: 1;
          padding: 16px;
          background: var(--bg-card);
          border: none;
          color: var(--text-primary);
          font-family: 'SF Mono', monospace;
          font-size: 13px;
          line-height: 1.5;
          resize: none;
        }

        .editor-main textarea:focus {
          outline: none;
        }

        .editor-output {
          background: var(--bg-primary);
          border-left: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
        }

        .output-header {
          display: flex;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          font-size: 12px;
          color: var(--text-secondary);
        }

        .output-header button {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 11px;
          cursor: pointer;
        }

        .output-content {
          flex: 1;
          padding: 12px 16px;
          overflow-y: auto;
          font-family: 'SF Mono', monospace;
          font-size: 12px;
        }

        .output-placeholder {
          color: var(--text-muted);
        }

        .output-line {
          color: var(--accent-green);
          margin-bottom: 4px;
        }

        /* ============================================
           ONBOARDING
           ============================================ */

        .onboarding-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          z-index: 300;
        }

        .onboarding-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 480px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 40px;
          z-index: 301;
          text-align: center;
        }

        .onboarding-progress {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 32px;
        }

        .progress-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--bg-hover);
          transition: all 0.3s;
        }

        .progress-dot.active {
          background: var(--accent-purple);
          transform: scale(1.3);
        }

        .progress-dot.completed {
          background: var(--accent-green);
        }

        .onboarding-content {
          margin-bottom: 32px;
        }

        .onboarding-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 20px;
        }

        .onboarding-content h2 {
          font-size: 24px;
          margin-bottom: 12px;
        }

        .onboarding-content p {
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .onboarding-actions {
          display: flex;
          justify-content: center;
          gap: 12px;
        }

        .back-btn,
        .next-btn {
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-btn {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        .next-btn {
          background: var(--accent-purple);
          border: none;
          color: white;
        }

        .next-btn:hover {
          background: #9333ea;
        }

        .skip-btn {
          display: block;
          margin: 24px auto 0;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
        }

        .skip-btn:hover {
          color: var(--text-secondary);
        }

        /* ============================================
           DOCS VIEWER
           ============================================ */

        .docs-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 200;
        }

        .docs-viewer {
          position: fixed;
          top: 0;
          right: 0;
          width: 700px;
          max-width: 90%;
          height: 100vh;
          background: var(--bg-card);
          border-left: 1px solid var(--border-color);
          z-index: 201;
          display: flex;
          flex-direction: column;
        }

        .docs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .docs-header h2 {
          font-size: 18px;
        }

        .docs-layout {
          flex: 1;
          display: flex;
          min-height: 0;
        }

        .docs-nav {
          width: 200px;
          padding: 16px;
          border-right: 1px solid var(--border-color);
          overflow-y: auto;
        }

        .docs-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 8px;
          text-align: left;
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
          margin-bottom: 4px;
          transition: all 0.2s;
        }

        .docs-nav-item:hover {
          background: var(--bg-hover);
        }

        .docs-nav-item.active {
          background: var(--accent-purple);
          color: white;
        }

        .docs-content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }

        .markdown-body h1 {
          font-size: 28px;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .markdown-body h2 {
          font-size: 20px;
          margin: 24px 0 12px;
          color: var(--accent-purple);
        }

        .markdown-body h3 {
          font-size: 16px;
          margin: 16px 0 8px;
        }

        .markdown-body p {
          margin-bottom: 12px;
          line-height: 1.7;
          color: var(--text-secondary);
        }

        .markdown-body li {
          margin-left: 20px;
          margin-bottom: 6px;
          color: var(--text-secondary);
        }

        .markdown-body code {
          font-family: 'SF Mono', monospace;
          font-size: 12px;
          background: var(--bg-secondary);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .markdown-body .table-row {
          display: block;
          padding: 4px 0;
          font-size: 11px;
        }

        /* ============================================
           USER PROFILE
           ============================================ */

        .user-profile {
          position: relative;
        }

        .profile-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .profile-trigger:hover {
          background: var(--bg-hover);
        }

        .profile-avatar {
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          color: white;
        }

        .profile-name {
          font-size: 13px;
          color: var(--text-primary);
        }

        .profile-arrow {
          font-size: 8px;
          color: var(--text-muted);
        }

        .profile-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          width: 240px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          z-index: 100;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .dropdown-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
        }

        .dropdown-avatar {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
          color: white;
        }

        .dropdown-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .dropdown-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .dropdown-email {
          font-size: 12px;
          color: var(--text-muted);
        }

        .dropdown-divider {
          height: 1px;
          background: var(--border-color);
          margin: 4px 0;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 16px;
          background: transparent;
          border: none;
          text-align: left;
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropdown-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .dropdown-item.logout {
          color: var(--accent-red);
        }

        .dropdown-item.logout:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        /* ============================================
           NOTIFICATION BELL
           ============================================ */

        .notification-bell {
          position: relative;
          width: 36px;
          height: 36px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .notification-bell:hover {
          background: var(--bg-hover);
          border-color: var(--accent-purple);
        }

        .bell-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          background: var(--accent-red);
          border-radius: 8px;
          font-size: 10px;
          font-weight: 600;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ============================================
           VOICE COMMAND
           ============================================ */

        .voice-command {
          position: relative;
          width: 36px;
          height: 36px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .voice-command:hover {
          background: var(--bg-hover);
        }

        .voice-command.listening {
          background: rgba(239, 68, 68, 0.1);
          border-color: var(--accent-red);
        }

        .voice-waves {
          position: absolute;
          bottom: -8px;
          display: flex;
          gap: 2px;
        }

        .voice-waves span {
          width: 3px;
          height: 8px;
          background: var(--accent-red);
          border-radius: 2px;
          animation: wave 0.5s ease-in-out infinite;
        }

        .voice-waves span:nth-child(1) { animation-delay: 0s; }
        .voice-waves span:nth-child(2) { animation-delay: 0.15s; }
        .voice-waves span:nth-child(3) { animation-delay: 0.3s; }

        @keyframes wave {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }

        /* ============================================
           KEYBOARD SHORTCUTS PANEL
           ============================================ */

        .shortcuts-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 200;
          backdrop-filter: blur(4px);
        }

        .shortcuts-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          z-index: 201;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .shortcuts-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .shortcuts-header h2 {
          font-size: 18px;
          font-weight: 600;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 24px;
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .shortcuts-content {
          padding: 20px 24px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          overflow-y: auto;
        }

        .shortcut-category h3 {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 12px;
        }

        .shortcut-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
        }

        .shortcut-keys {
          display: flex;
          gap: 4px;
        }

        .key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .shortcut-desc {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .shortcuts-footer {
          padding: 16px 24px;
          border-top: 1px solid var(--border-color);
          text-align: center;
          font-size: 13px;
          color: var(--text-muted);
        }

        /* ============================================
           QUICK AI ASSISTANT
           ============================================ */

        .quick-assist-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 200;
          backdrop-filter: blur(2px);
        }

        .quick-assist-panel {
          position: fixed;
          bottom: 100px;
          right: 24px;
          width: 380px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          z-index: 201;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .assist-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .assist-icon {
          font-size: 20px;
        }

        .assist-title {
          flex: 1;
          font-size: 14px;
          font-weight: 600;
        }

        .assist-shortcut {
          padding: 4px 8px;
          background: var(--bg-hover);
          border-radius: 4px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .assist-input-row {
          display: flex;
          gap: 10px;
          padding: 16px 20px;
        }

        .assist-input-row input {
          flex: 1;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-primary);
          font-size: 14px;
        }

        .assist-input-row input:focus {
          outline: none;
          border-color: var(--accent-purple);
        }

        .assist-input-row button {
          width: 44px;
          height: 44px;
          background: var(--accent-purple);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .assist-input-row button:hover {
          background: #9333ea;
        }

        .assist-input-row button:disabled {
          opacity: 0.5;
        }

        .assist-response {
          padding: 0 20px 16px;
        }

        .assist-response p {
          padding: 14px 16px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(6, 182, 212, 0.05));
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 10px;
          font-size: 14px;
          line-height: 1.5;
          color: var(--text-primary);
        }

        .assist-suggestions {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .suggestion-label {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 10px;
        }

        .suggestions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .suggestion-chip {
          padding: 6px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-chip:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--accent-purple);
        }

        /* ============================================
           THEME TOGGLE
           ============================================ */

        .theme-toggle {
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          border-radius: 8px;
          transition: background 0.2s;
        }

        .theme-toggle:hover {
          background: var(--bg-hover);
        }

        .theme-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ============================================
           BREADCRUMBS
           ============================================ */

        .breadcrumbs {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 24px 16px;
          font-size: 13px;
        }

        .crumb {
          color: var(--text-muted);
        }

        .crumb.home {
          cursor: pointer;
        }

        .crumb.home:hover {
          color: var(--text-secondary);
        }

        .crumb.current {
          color: var(--text-primary);
          font-weight: 500;
        }

        .crumb-sep {
          color: var(--text-muted);
        }

        /* ============================================
           CONTENT LAYOUT WITH RIGHT SIDEBAR
           ============================================ */

        .content-layout {
          display: flex;
          gap: 20px;
          flex: 1;
          padding: 0 24px 24px;
          min-height: 0;
        }

        .view-container {
          flex: 1;
          min-width: 0;
        }

        .right-sidebar {
          width: 300px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex-shrink: 0;
        }

        /* ============================================
           SYSTEM HEALTH
           ============================================ */

        .system-health {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .health-overall {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 20px;
        }

        .health-ring {
          width: 80px;
          height: 80px;
          position: relative;
        }

        .health-ring svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .ring-bg {
          fill: none;
          stroke: var(--bg-hover);
          stroke-width: 3;
        }

        .ring-progress {
          fill: none;
          stroke-width: 3;
          stroke-linecap: round;
          transition: stroke-dasharray 0.5s ease;
        }

        .health-ring.good .ring-progress { stroke: var(--accent-green); }
        .health-ring.warn .ring-progress { stroke: var(--accent-orange); }
        .health-ring.bad .ring-progress { stroke: var(--accent-red); }

        .health-percent {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 18px;
          font-weight: 700;
        }

        .health-label {
          margin-top: 8px;
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .health-metrics {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .health-metric {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .metric-icon {
          font-size: 16px;
        }

        .metric-name {
          font-size: 12px;
          color: var(--text-secondary);
          width: 80px;
        }

        .metric-bar {
          flex: 1;
          height: 6px;
          background: var(--bg-hover);
          border-radius: 3px;
          overflow: hidden;
        }

        .metric-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.5s ease;
        }

        .metric-fill.good { background: var(--accent-green); }
        .metric-fill.warn { background: var(--accent-orange); }
        .metric-fill.bad { background: var(--accent-red); }

        /* ============================================
           ACTIVITY FEED
           ============================================ */

        .activity-feed {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .feed-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .feed-header h3 {
          font-size: 14px;
          font-weight: 600;
        }

        .feed-filters {
          display: flex;
          gap: 4px;
        }

        .feed-filter {
          padding: 4px 8px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: var(--text-muted);
          font-size: 11px;
          cursor: pointer;
          text-transform: capitalize;
        }

        .feed-filter:hover {
          background: var(--bg-hover);
          color: var(--text-secondary);
        }

        .feed-filter.active {
          background: var(--accent-purple);
          color: white;
        }

        .feed-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
        }

        .feed-empty {
          text-align: center;
          padding: 32px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .feed-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border-color);
        }

        .feed-item:last-child {
          border-bottom: none;
        }

        .feed-icon {
          font-size: 18px;
        }

        .feed-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .feed-type {
          font-size: 12px;
          color: var(--text-primary);
          font-weight: 500;
        }

        .feed-time {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Light theme overrides */
        .main-content.light {
          --bg-primary: #f5f5f7;
          --bg-secondary: #ffffff;
          --bg-card: #ffffff;
          --bg-hover: #f0f0f2;
          --border-color: rgba(0, 0, 0, 0.08);
          --text-primary: #1d1d1f;
          --text-secondary: #6e6e73;
          --text-muted: #8e8e93;
        }

        .main-content.light .ambient-orb {
          opacity: 0.3;
        }

        /* ============================================
           WORKFLOW BUILDER STYLES
           ============================================ */

        .workflow-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .workflow-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .workflow-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .workflow-btn:hover {
          background: var(--bg-hover);
        }

        .workflow-save {
          padding: 8px 16px;
          background: var(--accent-purple);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .workflow-save:hover {
          background: #9333ea;
        }

        .workflow-container {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 16px;
          min-height: 0;
        }

        .workflow-canvas {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          background-image: radial-gradient(circle, rgba(168, 85, 247, 0.1) 1px, transparent 1px);
          background-size: 20px 20px;
        }

        .connections-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .connection-line {
          transition: stroke 0.2s;
        }

        .workflow-node {
          position: absolute;
          width: 150px;
          background: var(--bg-secondary);
          border: 2px solid;
          border-radius: 10px;
          cursor: move;
          user-select: none;
          overflow: hidden;
        }

        .workflow-node.selected {
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.3);
        }

        .node-header {
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: white;
        }

        .node-body {
          padding: 12px;
        }

        .node-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .node-ports {
          display: flex;
          justify-content: space-between;
          padding: 0 8px 8px;
        }

        .port {
          width: 10px;
          height: 10px;
          background: var(--bg-hover);
          border: 2px solid var(--text-muted);
          border-radius: 50%;
          cursor: pointer;
        }

        .port:hover {
          border-color: var(--accent-purple);
        }

        .workflow-sidebar {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .node-config h3 {
          font-size: 14px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .config-field {
          margin-bottom: 16px;
        }

        .config-field label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .config-field input {
          width: 100%;
          padding: 10px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
        }

        .config-value {
          text-transform: capitalize;
          color: var(--text-primary);
        }

        .delete-node {
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: var(--accent-red);
          font-size: 13px;
          cursor: pointer;
          margin-top: 16px;
          transition: all 0.2s;
        }

        .delete-node:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .no-selection {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          font-size: 13px;
        }

        /* ============================================
           API PLAYGROUND STYLES
           ============================================ */

        .playground-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .playground-info code {
          background: var(--bg-card);
          padding: 4px 10px;
          border-radius: 6px;
          font-family: 'SF Mono', monospace;
          font-size: 13px;
          color: var(--accent-cyan);
        }

        .playground-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 16px;
          min-height: 0;
        }

        .playground-main {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .request-builder {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
        }

        .request-line {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .request-line select {
          padding: 10px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--accent-green);
          font-size: 13px;
          font-weight: 600;
        }

        .request-line input {
          flex: 1;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-family: 'SF Mono', monospace;
          font-size: 13px;
        }

        .send-btn {
          padding: 10px 20px;
          background: var(--accent-cyan);
          border: none;
          border-radius: 8px;
          color: black;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .send-btn:hover {
          background: #14b8a6;
        }

        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .request-body {
          display: flex;
          flex-direction: column;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .section-header button {
          padding: 4px 10px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
        }

        .request-body textarea {
          min-height: 150px;
          padding: 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-family: 'SF Mono', monospace;
          font-size: 13px;
          resize: vertical;
        }

        .response-viewer {
          flex: 1;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .status-badge.success {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .response-content {
          flex: 1;
          overflow: auto;
        }

        .response-content pre {
          font-family: 'SF Mono', monospace;
          font-size: 13px;
          line-height: 1.6;
          color: var(--text-primary);
          white-space: pre-wrap;
        }

        .loading-response,
        .empty-response {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 12px;
          color: var(--text-muted);
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .playground-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .endpoints-list,
        .request-history {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
        }

        .endpoints-list h3,
        .request-history h3 {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }

        .endpoint-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          margin-bottom: 8px;
          transition: all 0.2s;
        }

        .endpoint-item:hover {
          background: var(--bg-hover);
        }

        .method-badge {
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }

        .method-badge.get { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); }
        .method-badge.post { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
        .method-badge.put { background: rgba(245, 158, 11, 0.2); color: var(--accent-orange); }
        .method-badge.delete { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }

        .endpoint-path {
          font-family: 'SF Mono', monospace;
          font-size: 12px;
          color: var(--text-primary);
        }

        .history-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-color);
          font-size: 12px;
        }

        .history-item:last-child {
          border-bottom: none;
        }

        .history-item .status {
          margin-left: auto;
          font-weight: 600;
        }

        .history-item .status.success { color: var(--accent-green); }
        .history-item .status.error { color: var(--accent-red); }

        /* ============================================
           INTEGRATIONS STYLES
           ============================================ */

        .integrations-view {
          display: flex;
          flex-direction: column;
        }

        .add-integration-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--accent-purple);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        .integrations-filters {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          min-width: 250px;
        }

        .search-box input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 13px;
        }

        .search-box input:focus {
          outline: none;
        }

        .search-box input::placeholder {
          color: var(--text-muted);
        }

        .category-tabs {
          display: flex;
          gap: 8px;
        }

        .category-tab {
          padding: 8px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: capitalize;
        }

        .category-tab:hover {
          background: var(--bg-hover);
        }

        .category-tab.active {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }

        .integrations-stats {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
        }

        .integrations-stats .stat-card {
          flex: 1;
          padding: 16px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .integrations-stats .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .integrations-stats .stat-label {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .integrations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .integration-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }

        .integration-card.connected {
          border-color: rgba(16, 185, 129, 0.3);
        }

        .integration-card.error {
          border-color: rgba(239, 68, 68, 0.3);
        }

        .integration-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .integration-icon {
          font-size: 28px;
        }

        .integration-info {
          flex: 1;
        }

        .integration-info h3 {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .integration-category {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .integration-status {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .integration-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 16px;
        }

        .integration-actions {
          display: flex;
          gap: 10px;
        }

        .connect-btn,
        .configure-btn {
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .connect-btn {
          background: var(--accent-green);
          border: none;
          color: white;
        }

        .connect-btn:hover {
          background: #059669;
        }

        .connect-btn.disconnect {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: var(--accent-red);
        }

        .connect-btn.disconnect:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .configure-btn {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        .configure-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* ============================================
           MARKETPLACE STYLES
           ============================================ */

        .marketplace-view {
          display: flex;
          flex-direction: column;
        }

        .marketplace-stats {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .marketplace-hero {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(6, 182, 212, 0.1));
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 16px;
          padding: 32px;
          margin-bottom: 24px;
        }

        .hero-content h3 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
          background: linear-gradient(90deg, var(--accent-purple), var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-content p {
          color: var(--text-secondary);
          font-size: 14px;
        }

        .marketplace-controls {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
          align-items: center;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
          flex: 1;
        }

        .filter-tab {
          padding: 8px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-tab:hover {
          background: var(--bg-hover);
        }

        .filter-tab.active {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }

        .marketplace-controls select {
          padding: 8px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 13px;
        }

        .marketplace-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .marketplace-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 20px;
          transition: all 0.2s;
        }

        .marketplace-card.installed {
          border-color: rgba(16, 185, 129, 0.3);
        }

        .marketplace-card .card-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .type-icon {
          font-size: 32px;
        }

        .item-info {
          flex: 1;
        }

        .item-info h3 {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .verified-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          background: var(--accent-cyan);
          border-radius: 50%;
          font-size: 10px;
          color: white;
        }

        .author {
          font-size: 12px;
          color: var(--text-muted);
        }

        .price {
          padding: 4px 10px;
          background: var(--bg-hover);
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--accent-green);
        }

        .item-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 12px;
        }

        .item-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 16px;
        }

        .tag {
          padding: 4px 8px;
          background: rgba(168, 85, 247, 0.1);
          border-radius: 4px;
          font-size: 11px;
          color: var(--accent-purple);
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }

        .card-footer .stats {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .rating {
          color: var(--accent-orange);
        }

        .install-btn {
          padding: 8px 16px;
          background: var(--accent-purple);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .install-btn:hover {
          background: #9333ea;
        }

        .install-btn.installed {
          background: transparent;
          border: 1px solid var(--accent-green);
          color: var(--accent-green);
        }

        /* Responsive */
        @media (max-width: 1400px) {
          .analytics-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .analytics-card.chart-card,
          .analytics-card.provider-card {
            grid-column: span 1;
          }
        }

        @media (max-width: 1200px) {
          .overview-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .files-layout {
            grid-template-columns: 250px 1fr;
          }
        }

        @media (max-width: 900px) {
          .sidebar {
            width: 72px;
          }

          .sidebar .logo-text,
          .sidebar .nav-item span:last-child,
          .sidebar .status-text,
          .search-trigger span:not(.shortcut) {
            display: none;
          }

          .search-trigger {
            padding: 10px;
            justify-content: center;
          }

          .search-trigger .shortcut {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .sidebar {
            width: 64px;
          }

          .overview-grid,
          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .analytics-card.chart-card,
          .analytics-card.provider-card {
            grid-column: span 1;
          }

          .files-layout {
            grid-template-columns: 1fr;
          }

          .file-tree {
            max-height: 300px;
          }

          .view-container {
            padding: 16px;
          }

          .creation-types {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 480px) {
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            z-index: 100;
          }

          .main-content {
            margin-left: 64px;
          }

          .creation-types {
            grid-template-columns: repeat(2, 1fr);
          }

          .templates-grid {
            grid-template-columns: 1fr 1fr;
          }

          .workflow-container {
            grid-template-columns: 1fr;
          }

          .workflow-sidebar {
            display: none;
          }

          .playground-layout {
            grid-template-columns: 1fr;
          }

          .playground-sidebar {
            display: none;
          }

          .marketplace-grid,
          .integrations-grid {
            grid-template-columns: 1fr;
          }

          .category-tabs,
          .filter-tabs {
            flex-wrap: wrap;
          }

          .integrations-stats {
            flex-wrap: wrap;
          }

          .right-sidebar {
            display: none;
          }

          .content-layout {
            padding: 0 16px 16px;
          }

          .breadcrumbs {
            padding: 0 16px 12px;
          }

          .top-bar {
            padding: 12px 16px;
          }

          .shortcuts-content {
            grid-template-columns: 1fr;
          }

          .quick-assist-panel {
            right: 16px;
            left: 16px;
            width: auto;
          }
        }

        /* ============================================
           SPACES SWITCHER
           ============================================ */

        .space-switcher {
          display: flex;
          gap: 6px;
          padding: 12px;
          overflow-x: auto;
          border-bottom: 1px solid var(--border-color);
        }

        .space-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          white-space: nowrap;
        }

        .space-tab:hover {
          background: rgba(168, 85, 247, 0.1);
          border-color: rgba(168, 85, 247, 0.3);
        }

        .space-tab.active {
          background: rgba(var(--space-color), 0.15);
          border-color: var(--space-color);
          color: var(--text-primary);
        }

        .space-icon {
          font-size: 14px;
        }

        .space-name {
          font-weight: 500;
        }

        .space-indicator {
          position: absolute;
          bottom: -1px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 3px;
          border-radius: 2px;
        }

        .add-space {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: transparent;
          border: 1px dashed var(--border-color);
          border-radius: 10px;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .add-space:hover {
          background: var(--bg-hover);
          border-color: var(--accent-purple);
          color: var(--accent-purple);
        }

        /* ============================================
           THEME CUSTOMIZER
           ============================================ */

        .theme-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 300;
          backdrop-filter: blur(4px);
        }

        .theme-customizer {
          position: fixed;
          top: 0;
          right: 0;
          width: 400px;
          max-width: 100%;
          height: 100vh;
          background: var(--bg-card);
          border-left: 1px solid var(--border-color);
          z-index: 301;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .theme-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .theme-header h2 {
          font-size: 18px;
          font-weight: 600;
        }

        .theme-header button {
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 24px;
          cursor: pointer;
          border-radius: 8px;
        }

        .theme-header button:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .theme-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .theme-section {
          margin-bottom: 28px;
        }

        .theme-section h3 {
          font-size: 13px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 16px;
        }

        .theme-presets {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .preset-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preset-btn:hover {
          background: var(--bg-secondary);
          border-color: var(--preset-color);
        }

        .preset-swatch {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--preset-color);
        }

        .theme-sliders {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .slider-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .slider-group label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .hue-slider {
          width: 100%;
          height: 8px;
          -webkit-appearance: none;
          background: linear-gradient(to right,
            hsl(0, 80%, 50%),
            hsl(60, 80%, 50%),
            hsl(120, 80%, 50%),
            hsl(180, 80%, 50%),
            hsl(240, 80%, 50%),
            hsl(300, 80%, 50%),
            hsl(360, 80%, 50%)
          );
          border-radius: 4px;
          cursor: pointer;
        }

        .hue-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        }

        .contrast-options,
        .mode-toggle {
          display: flex;
          gap: 8px;
        }

        .contrast-btn,
        .mode-toggle button {
          flex: 1;
          padding: 12px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: capitalize;
        }

        .contrast-btn:hover,
        .mode-toggle button:hover {
          background: var(--bg-secondary);
        }

        .contrast-btn.active,
        .mode-toggle button.active {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }

        .theme-preview {
          margin-top: 24px;
        }

        .preview-card {
          padding: 20px;
          background: var(--theme-surface, var(--bg-secondary));
          border: 1px solid var(--theme-border, var(--border-color));
          border-radius: 12px;
        }

        .preview-header {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--theme-text, var(--text-primary));
        }

        .preview-body {
          font-size: 13px;
          color: var(--theme-text-secondary, var(--text-secondary));
          margin-bottom: 16px;
        }

        .preview-btn {
          padding: 10px 20px;
          background: var(--theme-accent, var(--accent-purple));
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }

        .theme-actions {
          padding: 20px 24px;
          border-top: 1px solid var(--border-color);
        }

        .apply-btn {
          width: 100%;
          padding: 14px;
          background: var(--accent-purple);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .apply-btn:hover {
          background: #9333ea;
        }

        /* ============================================
           BOOSTS PANEL
           ============================================ */

        .boosts-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 300;
          backdrop-filter: blur(4px);
        }

        .boosts-panel {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          max-width: 95%;
          max-height: 70vh;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-bottom: none;
          border-radius: 20px 20px 0 0;
          z-index: 301;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .boosts-header {
          padding: 24px;
          border-bottom: 1px solid var(--border-color);
          position: relative;
        }

        .boosts-header h2 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .boosts-header p {
          font-size: 13px;
          color: var(--text-muted);
        }

        .boosts-header .close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
        }

        .boosts-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
        }

        .boost-item {
          display: flex;
          align-items: center;
          padding: 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          margin-bottom: 12px;
          transition: all 0.2s;
        }

        .boost-item.enabled {
          border-color: var(--accent-purple);
          background: rgba(168, 85, 247, 0.1);
        }

        .boost-info {
          flex: 1;
        }

        .boost-info h3 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .boost-info p {
          font-size: 12px;
          color: var(--text-muted);
        }

        .boost-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .edit-boost {
          padding: 6px 12px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .edit-boost:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .boost-toggle {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .boost-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: var(--bg-secondary);
          border-radius: 24px;
          transition: 0.3s;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.3s;
        }

        .boost-toggle input:checked + .toggle-slider {
          background: var(--accent-purple);
        }

        .boost-toggle input:checked + .toggle-slider:before {
          transform: translateX(20px);
        }

        .add-boost-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          background: transparent;
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          color: var(--text-muted);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 8px;
        }

        .add-boost-btn:hover {
          border-color: var(--accent-purple);
          color: var(--accent-purple);
          background: rgba(168, 85, 247, 0.05);
        }

        .boost-editor {
          padding: 20px 24px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .boost-editor h3 {
          font-size: 14px;
          margin-bottom: 12px;
        }

        .boost-editor textarea {
          width: 100%;
          height: 120px;
          padding: 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-family: 'SF Mono', monospace;
          font-size: 12px;
          resize: vertical;
          margin-bottom: 12px;
        }

        .editor-actions {
          display: flex;
          gap: 10px;
        }

        .editor-actions button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .editor-actions button:first-child {
          background: var(--accent-purple);
          border: none;
          color: white;
        }

        .editor-actions button:last-child {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        /* ============================================
           ENHANCED OVERVIEW & 3D HERO ORB
           ============================================ */

        .enhanced-overview {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .overview-hero {
          display: flex;
          align-items: center;
          gap: 32px;
          padding: 32px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(6, 182, 212, 0.05));
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 20px;
        }

        .hero-orb-container {
          width: 200px;
          height: 200px;
          position: relative;
        }

        .hero-orb-container canvas {
          border-radius: 16px;
        }

        .orb-overlay {
          position: absolute;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          pointer-events: none;
        }

        .orb-phi {
          font-family: 'SF Mono', monospace;
          font-size: 14px;
          font-weight: 600;
          color: white;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        }

        .orb-state {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .hero-stats {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .hero-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .hero-stat .stat-value {
          font-size: 32px;
          font-weight: 700;
          background: linear-gradient(90deg, var(--accent-purple), var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-stat .stat-label {
          font-size: 13px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .quick-action-bar {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .quick-action {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-action:hover {
          background: var(--bg-hover);
          border-color: var(--accent-purple);
        }

        .qa-icon {
          font-size: 18px;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
        }

        .metric-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 20px;
        }

        .metric-card h3 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text-primary);
        }

        .neuro-bars {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .neuro-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .neuro-label {
          width: 100px;
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: capitalize;
        }

        .neuro-track {
          flex: 1;
          height: 8px;
          background: var(--bg-hover);
          border-radius: 4px;
          overflow: hidden;
        }

        .neuro-fill {
          height: 100%;
          border-radius: 4px;
        }

        .neuro-value {
          width: 40px;
          font-size: 12px;
          font-weight: 600;
          text-align: right;
          color: var(--text-primary);
        }

        .kernel-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .kernel-level {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          opacity: 0.4;
          transition: opacity 0.3s;
        }

        .kernel-level.active {
          opacity: 1;
        }

        .level-name {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .level-ring {
          width: 60px;
          height: 60px;
          position: relative;
        }

        .level-ring svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .level-ring .ring-bg {
          fill: none;
          stroke: var(--bg-hover);
          stroke-width: 4;
        }

        .level-ring .ring-progress {
          fill: none;
          stroke: var(--accent-purple);
          stroke-width: 4;
          stroke-linecap: round;
        }

        .level-percent {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .events-stream {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 200px;
          overflow-y: auto;
        }

        .event-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-hover);
          border-radius: 8px;
        }

        .event-item .event-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-purple);
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        }

        .event-item .event-type {
          flex: 1;
          font-size: 12px;
          color: var(--text-primary);
        }

        .event-item .event-time {
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'SF Mono', monospace;
        }

        /* ============================================
           AI AUTOFILL
           ============================================ */

        .ai-autofill {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          margin-bottom: 8px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.2);
        }

        .autofill-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-color);
          font-size: 12px;
          color: var(--text-muted);
        }

        .autofill-icon {
          font-size: 14px;
        }

        .autofill-loading {
          width: 12px;
          height: 12px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-purple);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-left: auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .autofill-list {
          display: flex;
          flex-direction: column;
        }

        .autofill-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: transparent;
          border: none;
          text-align: left;
          color: var(--text-secondary);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .autofill-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .suggestion-icon {
          color: var(--accent-purple);
        }

        .suggestion-text {
          flex: 1;
        }

        .suggestion-key {
          padding: 2px 6px;
          background: var(--bg-hover);
          border-radius: 4px;
          font-size: 10px;
          color: var(--text-muted);
        }

        /* ============================================
           MCP HUB
           ============================================ */

        .mcp-hub-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .mcp-hub-view .view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .mcp-stats {
          display: flex;
          gap: 24px;
        }

        .mcp-stats .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }

        .mcp-stats .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--accent-purple);
        }

        .mcp-stats .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* MCP Constellation */
        .mcp-constellation {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 24px;
        }

        .constellation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .constellation-header h3 {
          font-size: 16px;
          font-weight: 600;
        }

        .constellation-filters {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          padding: 6px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .filter-btn.active {
          background: var(--cat-color, var(--accent-purple));
          border-color: var(--cat-color, var(--accent-purple));
          color: white;
        }

        .constellation-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .server-node {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          background: var(--bg-hover);
          border: 2px solid var(--border-color);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .server-node:hover {
          background: var(--bg-secondary);
          border-color: var(--server-color);
        }

        .server-node.selected {
          background: rgba(168, 85, 247, 0.1);
          border-color: var(--accent-purple);
        }

        .server-node.disconnected {
          opacity: 0.5;
        }

        .server-node .server-icon {
          font-size: 28px;
        }

        .server-node .server-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .server-node .server-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .server-node .server-tools {
          font-size: 12px;
          color: var(--text-muted);
        }

        .server-node .server-status {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .server-node .server-status.connected {
          background: var(--accent-green);
          box-shadow: 0 0 8px var(--accent-green);
        }

        .server-node .server-status.disconnected {
          background: var(--text-muted);
        }

        .server-node .server-status.error {
          background: var(--accent-red);
          box-shadow: 0 0 8px var(--accent-red);
        }

        /* MCP Workspace */
        .mcp-workspace {
          display: grid;
          grid-template-columns: 280px 1fr 300px;
          gap: 16px;
        }

        .mcp-tools-panel,
        .mcp-executor,
        .mcp-history {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
        }

        .mcp-tools-panel h3,
        .mcp-executor h3,
        .mcp-history h3 {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .server-icon-small {
          font-size: 18px;
        }

        .tools-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          overflow-y: auto;
        }

        .tool-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .tool-item:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-purple);
        }

        .tool-item.selected {
          background: rgba(168, 85, 247, 0.1);
          border-color: var(--accent-purple);
        }

        .tool-item .tool-icon {
          font-size: 16px;
        }

        .tool-item .tool-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .tool-item .tool-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .tool-item .tool-desc {
          font-size: 11px;
          color: var(--text-muted);
        }

        .no-server-selected,
        .no-tool-selected {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-muted);
        }

        .empty-icon {
          font-size: 48px;
          opacity: 0.3;
        }

        .no-server-selected p,
        .no-tool-selected p {
          font-size: 13px;
          text-align: center;
        }

        /* Executor */
        .executor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .executor-header h3 {
          margin-bottom: 0;
        }

        .executor-server {
          font-size: 12px;
          padding: 4px 10px;
          background: var(--bg-hover);
          border-radius: 6px;
          color: var(--text-secondary);
        }

        .executor-input {
          margin-bottom: 16px;
        }

        .executor-input label,
        .executor-output label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .executor-input textarea {
          width: 100%;
          height: 120px;
          padding: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-family: 'SF Mono', monospace;
          font-size: 12px;
          resize: vertical;
        }

        .execute-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          background: var(--accent-purple);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .execute-btn:hover:not(:disabled) {
          background: #9333ea;
        }

        .execute-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .execute-btn .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .executor-output {
          margin-top: 16px;
        }

        .executor-output pre {
          padding: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-family: 'SF Mono', monospace;
          font-size: 11px;
          color: var(--accent-green);
          overflow-x: auto;
          max-height: 200px;
        }

        /* History */
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          overflow-y: auto;
        }

        .history-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-hover);
          border-radius: 8px;
        }

        .history-item.error {
          border-left: 3px solid var(--accent-red);
        }

        .history-item.success {
          border-left: 3px solid var(--accent-green);
        }

        .history-icon {
          font-size: 18px;
        }

        .history-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .history-tool {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .history-server {
          font-size: 10px;
          color: var(--text-muted);
        }

        .history-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 1px;
        }

        .history-duration {
          font-size: 11px;
          font-family: 'SF Mono', monospace;
          color: var(--text-secondary);
        }

        .history-time {
          font-size: 10px;
          color: var(--text-muted);
        }

        .history-status {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 12px;
          font-weight: 600;
        }

        .history-status.success {
          background: rgba(16, 185, 129, 0.2);
          color: var(--accent-green);
        }

        .history-status.error {
          background: rgba(239, 68, 68, 0.2);
          color: var(--accent-red);
        }

        /* Quick Actions */
        .mcp-quick-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .quick-action-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .quick-action-card:hover {
          background: var(--bg-hover);
          border-color: var(--accent-purple);
        }

        .quick-action-card .qa-icon {
          font-size: 32px;
        }

        .quick-action-card .qa-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .quick-action-card .qa-desc {
          font-size: 12px;
          color: var(--text-muted);
        }

        /* ============================================
           MCP ADVANCED FEATURES
           ============================================ */

        /* View Header Actions */
        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .search-trigger,
        .view-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .search-trigger:hover,
        .view-toggle:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-purple);
          color: var(--text-primary);
        }

        .view-toggle.active {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: white;
        }

        .shortcut {
          font-size: 10px;
          padding: 2px 5px;
          background: var(--bg-secondary);
          border-radius: 4px;
          color: var(--text-muted);
          font-family: 'SF Mono', monospace;
        }

        /* Favorites Bar */
        .mcp-favorites-bar {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(139, 92, 246, 0.05));
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 16px 20px;
        }

        .favorites-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .favorites-header h4 {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .fav-count {
          font-size: 11px;
          padding: 2px 8px;
          background: var(--accent-purple);
          border-radius: 10px;
          color: white;
        }

        .favorites-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .favorite-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .favorite-chip:hover {
          background: var(--bg-hover);
          border-color: var(--accent-purple);
          transform: translateY(-2px);
        }

        .favorite-chip .fav-icon {
          font-size: 14px;
        }

        .favorite-chip .fav-name {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
        }

        /* Tool Item with Favorite Button */
        .tool-item {
          position: relative;
        }

        .tool-main {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          padding: 0;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          color: inherit;
        }

        .tool-fav-btn {
          padding: 6px;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          opacity: 0;
        }

        .tool-item:hover .tool-fav-btn {
          opacity: 1;
        }

        .tool-fav-btn:hover {
          color: var(--accent-yellow);
          transform: scale(1.2);
        }

        .tool-fav-btn.active {
          color: var(--accent-yellow);
          opacity: 1;
        }

        .tool-item.favorited {
          border-color: rgba(234, 179, 8, 0.3);
        }

        /* MCP Tool Search Overlay */
        .mcp-tool-search-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 15vh;
          z-index: 1000;
        }

        .mcp-search-modal {
          width: 100%;
          max-width: 600px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }

        .search-input-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .search-input-wrapper .search-icon {
          font-size: 20px;
          color: var(--text-muted);
        }

        .search-input-wrapper input {
          flex: 1;
          background: none;
          border: none;
          font-size: 18px;
          color: var(--text-primary);
          outline: none;
        }

        .search-input-wrapper input::placeholder {
          color: var(--text-muted);
        }

        .search-results {
          max-height: 400px;
          overflow-y: auto;
        }

        .search-result-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 20px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .search-result-item:hover,
        .search-result-item.selected {
          background: var(--bg-hover);
        }

        .search-result-item .result-icon {
          font-size: 24px;
        }

        .search-result-item .result-info {
          flex: 1;
        }

        .search-result-item .result-tool {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .search-result-item .result-server {
          font-size: 12px;
          color: var(--text-muted);
        }

        .search-result-item .result-desc {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .search-no-results {
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
        }

        .search-no-results .no-results-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        /* MCP Activity Sparkline */
        .mcp-activity-sparkline {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 30px;
          padding: 8px 12px;
          background: var(--bg-hover);
          border-radius: 8px;
        }

        .sparkline-bar {
          width: 6px;
          background: linear-gradient(to top, var(--accent-purple), var(--accent-blue));
          border-radius: 2px;
          transition: height 0.3s ease;
          min-height: 2px;
        }

        .sparkline-bar:hover {
          background: var(--accent-yellow);
        }

        /* MCP 3D Constellation */
        .mcp-constellation-3d {
          height: 400px;
          background: radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a14 100%);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          position: relative;
        }

        .mcp-constellation-3d canvas {
          cursor: grab;
        }

        .mcp-constellation-3d canvas:active {
          cursor: grabbing;
        }

        .constellation-3d-hint {
          position: absolute;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 12px;
          color: var(--text-muted);
          background: rgba(0, 0, 0, 0.5);
          padding: 6px 14px;
          border-radius: 20px;
          pointer-events: none;
        }

        /* Server Sphere in 3D */
        .server-sphere-label {
          position: absolute;
          background: var(--bg-card);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          white-space: nowrap;
          pointer-events: none;
        }

        /* Constellation Legend */
        .constellation-legend {
          position: absolute;
          right: 16px;
          top: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          padding: 12px;
          border-radius: 12px;
          max-height: 300px;
          overflow-y: auto;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .legend-item:hover {
          background: rgba(168, 85, 247, 0.2);
          border-color: rgba(168, 85, 247, 0.5);
        }

        .legend-item.selected {
          background: rgba(168, 85, 247, 0.3);
          border-color: var(--accent-purple);
        }

        .legend-icon {
          font-size: 16px;
        }

        .legend-name {
          flex: 1;
          font-size: 12px;
          color: var(--text-primary);
        }

        .legend-count {
          font-size: 10px;
          padding: 2px 6px;
          background: var(--accent-purple);
          border-radius: 10px;
          color: white;
        }

        /* MCP Search Trigger */
        .mcp-search-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 200px;
        }

        .mcp-search-trigger:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-purple);
          color: var(--text-primary);
        }

        .mcp-search-trigger .shortcut {
          margin-left: auto;
          font-size: 10px;
          padding: 3px 6px;
          background: var(--bg-secondary);
          border-radius: 4px;
          font-family: 'SF Mono', monospace;
        }

        /* MCP Tool Search Overlay */
        .mcp-tool-search {
          position: fixed;
          top: 100px;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
          z-index: 1000;
          overflow: hidden;
        }

        .mcp-tool-search .search-input-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .mcp-tool-search .search-input-wrapper input {
          flex: 1;
          background: none;
          border: none;
          font-size: 16px;
          color: var(--text-primary);
          outline: none;
        }

        .close-search {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-hover);
          border: none;
          border-radius: 6px;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-search:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .search-results {
          max-height: 400px;
          overflow-y: auto;
          padding: 8px;
        }

        .search-result {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 16px;
          background: none;
          border: 1px solid transparent;
          border-radius: 10px;
          color: inherit;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }

        .search-result:hover {
          background: var(--bg-hover);
          border-color: var(--border-color);
        }

        .search-result .result-icon {
          font-size: 22px;
        }

        .search-result .result-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .search-result .result-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .search-result .result-desc {
          font-size: 12px;
          color: var(--text-muted);
        }

        .search-result .result-server {
          font-size: 11px;
          padding: 3px 8px;
          background: var(--bg-secondary);
          border-radius: 6px;
          color: var(--text-secondary);
        }

        /* Activity Sparkline */
        .activity-sparkline {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
        }

        .sparkline-label {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .sparkline-bars {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 24px;
        }

        .sparkline-bars .sparkline-bar {
          flex: 1;
          min-height: 2px;
          background: linear-gradient(to top, var(--accent-purple), var(--accent-blue));
          border-radius: 1px;
          transition: height 0.3s ease, background 0.2s;
        }

        .sparkline-bars .sparkline-bar:hover {
          background: var(--accent-yellow);
        }

        /* MCP Header Actions */
        .mcp-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Favorites Label */
        .favorites-label {
          font-size: 12px;
          color: var(--text-secondary);
          margin-right: 12px;
        }

        .favorites-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        /* Server Detail Popover */
        .server-popover {
          position: fixed;
          width: 320px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          overflow: hidden;
        }

        .popover-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: var(--bg-hover);
          border-bottom: 1px solid var(--border-color);
        }

        .popover-icon {
          font-size: 32px;
        }

        .popover-title {
          flex: 1;
        }

        .popover-title h4 {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .popover-status {
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .popover-status.connected {
          color: var(--accent-green);
        }

        .popover-status.disconnected {
          color: var(--text-muted);
        }

        .popover-close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .popover-close:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .popover-desc {
          padding: 16px 20px;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0;
        }

        .popover-stats {
          display: flex;
          gap: 16px;
          padding: 0 20px 16px;
        }

        .popover-stat {
          display: flex;
          flex-direction: column;
          padding: 10px 16px;
          background: var(--bg-hover);
          border-radius: 10px;
        }

        .popover-stat .stat-val {
          font-size: 16px;
          font-weight: 700;
          color: var(--accent-purple);
        }

        .popover-stat .stat-lbl {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .popover-tools {
          padding: 0 20px 20px;
        }

        .popover-tools h5 {
          font-size: 11px;
          text-transform: uppercase;
          color: var(--text-muted);
          margin: 0 0 10px;
          letter-spacing: 0.05em;
        }

        .mini-tools-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .mini-tool {
          padding: 4px 10px;
          background: var(--bg-secondary);
          border-radius: 6px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .mini-tool.more {
          background: var(--accent-purple);
          color: white;
        }

        /* Live Execution Indicator */
        .live-execution {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 24px;
          background: var(--bg-card);
          border: 1px solid var(--accent-purple);
          border-radius: 40px;
          box-shadow: 0 8px 32px rgba(168, 85, 247, 0.3);
          z-index: 999;
        }

        .execution-pulse {
          width: 12px;
          height: 12px;
          background: var(--accent-green);
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }

        .execution-info {
          display: flex;
          flex-direction: column;
        }

        .execution-tool {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .execution-duration {
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'SF Mono', monospace;
        }

        .execution-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-purple);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        /* Category Badge */
        .category-badge {
          display: inline-flex;
          padding: 3px 10px;
          background: color-mix(in srgb, var(--badge-color) 20%, transparent);
          border: 1px solid var(--badge-color);
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
          color: var(--badge-color);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Executor Enhancements */
        .executor-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .executor-desc {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0 0 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .executor-templates {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .templates-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .templates-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .template-btn {
          padding: 6px 12px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .template-btn:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-purple);
          color: var(--text-primary);
        }

        .executor-input {
          position: relative;
        }

        .input-actions {
          position: absolute;
          top: 32px;
          right: 8px;
          display: flex;
          gap: 4px;
        }

        .input-action {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
          opacity: 0.5;
        }

        .input-action:hover {
          opacity: 1;
          background: var(--bg-secondary);
          border-color: var(--accent-purple);
        }

        .executor-input textarea {
          padding-right: 100px;
        }

        /* MCP Health Banner */
        .mcp-health-banner {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 12px 20px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.05));
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 12px;
        }

        .health-status-grid {
          display: flex;
          gap: 4px;
        }

        .health-dot {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
          cursor: default;
        }

        .health-dot.connected {
          background: rgba(16, 185, 129, 0.2);
          border: 1px solid rgba(16, 185, 129, 0.5);
        }

        .health-dot.disconnected {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.5);
          opacity: 0.6;
        }

        .health-dot.error {
          background: rgba(245, 158, 11, 0.2);
          border: 1px solid rgba(245, 158, 11, 0.5);
        }

        .health-dot:hover {
          transform: scale(1.15);
        }

        .health-summary {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .health-indicator {
          margin-left: auto;
        }

        .all-healthy {
          color: var(--accent-green);
          font-size: 12px;
          font-weight: 600;
        }

        .some-issues {
          color: var(--accent-yellow);
          font-size: 12px;
          font-weight: 600;
        }

        /* MCP Tool Identifier */
        .mcp-tool-identifier {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(6, 182, 212, 0.05));
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .mcp-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .mcp-name {
          flex: 1;
          font-family: 'SF Mono', monospace;
          font-size: 12px;
          color: var(--accent-purple);
          background: var(--bg-secondary);
          padding: 4px 8px;
          border-radius: 4px;
        }

        .copy-mcp-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .copy-mcp-btn:hover {
          opacity: 1;
        }

        /* Bridge Status */
        .bridge-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 6px;
          margin-bottom: 12px;
        }

        .bridge-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .bridge-dot.active {
          background: var(--accent-green);
          box-shadow: 0 0 8px var(--accent-green);
          animation: pulse 2s ease-in-out infinite;
        }

        .bridge-text {
          font-size: 11px;
          color: var(--accent-green);
          font-weight: 500;
        }

        /* Parameters Schema */
        .params-schema {
          padding: 12px;
          background: var(--bg-hover);
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .params-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: block;
          margin-bottom: 8px;
        }

        .params-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .param-item {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .param-item code {
          color: var(--accent-blue);
          background: var(--bg-secondary);
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'SF Mono', monospace;
        }

        .param-type {
          color: var(--text-muted);
          font-style: italic;
        }

        /* Keyboard Shortcuts Bar */
        .mcp-shortcuts-bar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 20px;
          background: var(--bg-hover);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          margin-top: auto;
        }

        .shortcuts-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .shortcuts-list {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }

        .shortcut-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .shortcut-item kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-family: 'SF Mono', monospace;
          font-size: 11px;
          color: var(--text-primary);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        @media (max-width: 1200px) {
          .mcp-workspace {
            grid-template-columns: 1fr;
          }

          .mcp-tools-panel,
          .mcp-history {
            max-height: 300px;
          }
        }

        @media (max-width: 768px) {
          .constellation-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .mcp-quick-actions {
            grid-template-columns: repeat(2, 1fr);
          }

          .constellation-filters {
            flex-wrap: wrap;
          }
        }

        /* ============================================= */
        /* MCP Learning Panel                            */
        /* ============================================= */

        .mcp-learning-panel {
          background: linear-gradient(135deg, var(--bg-card), color-mix(in srgb, var(--accent-purple) 5%, var(--bg-card)));
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .learning-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .learning-header:hover {
          background: var(--bg-hover);
        }

        .learning-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .learning-icon {
          font-size: 18px;
        }

        .learning-summary {
          display: flex;
          gap: 16px;
          margin-left: auto;
        }

        .learning-stat {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .learning-stat .stat-num {
          font-size: 16px;
          font-weight: 700;
          color: var(--accent-purple);
        }

        .learning-stat .stat-lbl {
          font-size: 11px;
          color: var(--text-muted);
        }

        .expand-icon {
          color: var(--text-muted);
          font-size: 10px;
        }

        .learning-content {
          padding: 0 20px 20px;
          overflow: hidden;
        }

        .insights-section,
        .top-tools-section,
        .heatmap-section,
        .memory-sync-section {
          margin-bottom: 20px;
        }

        .insights-section h4,
        .top-tools-section h4,
        .heatmap-section h4 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin: 0 0 12px;
        }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .insight-card {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .insight-card:hover {
          border-color: var(--accent-purple);
          transform: translateY(-2px);
        }

        .insight-card.achievement {
          border-left: 3px solid var(--accent-yellow);
        }

        .insight-card.warning {
          border-left: 3px solid var(--accent-red);
        }

        .insight-card.recommendation {
          border-left: 3px solid var(--accent-blue);
        }

        .insight-icon {
          font-size: 18px;
        }

        .insight-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .insight-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .insight-desc {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .usage-chart {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .usage-bar-row {
          display: grid;
          grid-template-columns: 30px 100px 1fr 40px 45px;
          align-items: center;
          gap: 10px;
        }

        .usage-rank {
          font-size: 10px;
          color: var(--text-muted);
          text-align: center;
        }

        .usage-tool {
          font-size: 12px;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .usage-bar-container {
          height: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          overflow: hidden;
        }

        .usage-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-purple), var(--accent-blue));
          border-radius: 4px;
        }

        .usage-count {
          font-size: 11px;
          color: var(--text-secondary);
          text-align: right;
        }

        .usage-success {
          font-size: 10px;
          font-weight: 600;
          text-align: right;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .usage-success.high {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
        }

        .usage-success.mid {
          background: rgba(245, 158, 11, 0.15);
          color: var(--accent-yellow);
        }

        .usage-success.low {
          background: rgba(239, 68, 68, 0.15);
          color: var(--accent-red);
        }

        .category-heatmap {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .heatmap-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 14px 8px;
          background: hsl(var(--cat-hue), 70%, calc(20% + var(--intensity) * 30%));
          border-radius: 10px;
          text-align: center;
          transition: all 0.3s;
        }

        .heatmap-cell:hover {
          transform: scale(1.05);
        }

        .heatmap-label {
          font-size: 10px;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
        }

        .heatmap-value {
          font-size: 16px;
          font-weight: 700;
          color: white;
        }

        .sync-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 10px;
        }

        .sync-icon {
          font-size: 16px;
        }

        .sync-text {
          font-size: 12px;
          color: var(--accent-green);
        }

        .sync-time {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-muted);
        }

        /* ============================================= */
        /* Toast Notifications                           */
        /* ============================================= */

        .toast-container {
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 10000;
          pointer-events: none;
        }

        .toast {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          pointer-events: auto;
          cursor: pointer;
          min-width: 280px;
          max-width: 400px;
        }

        .toast-success {
          border-left: 4px solid var(--accent-green);
        }

        .toast-error {
          border-left: 4px solid var(--accent-red);
        }

        .toast-warning {
          border-left: 4px solid var(--accent-yellow);
        }

        .toast-info {
          border-left: 4px solid var(--accent-blue);
        }

        .toast-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          border-radius: 50%;
        }

        .toast-success .toast-icon {
          background: rgba(16, 185, 129, 0.2);
          color: var(--accent-green);
        }

        .toast-error .toast-icon {
          background: rgba(239, 68, 68, 0.2);
          color: var(--accent-red);
        }

        .toast-warning .toast-icon {
          background: rgba(245, 158, 11, 0.2);
          color: var(--accent-yellow);
        }

        .toast-info .toast-icon {
          background: rgba(59, 130, 246, 0.2);
          color: var(--accent-blue);
        }

        .toast-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .toast-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .toast-message {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .toast-close {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .toast-close:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        /* ============================================= */
        /* Smart Suggestions                             */
        /* ============================================= */

        .smart-suggestions {
          margin-bottom: 16px;
        }

        .suggestions-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 10px;
        }

        .suggestions-icon {
          font-size: 14px;
        }

        .suggestions-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .suggestion-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: linear-gradient(135deg, var(--bg-card), color-mix(in srgb, var(--accent-purple) 10%, var(--bg-card)));
          border: 1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent);
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-chip:hover {
          border-color: var(--accent-purple);
          box-shadow: 0 4px 16px rgba(168, 85, 247, 0.2);
        }

        .suggestion-server-icon {
          font-size: 14px;
        }

        .suggestion-tool {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .suggestion-reason {
          font-size: 10px;
          color: var(--accent-purple);
          padding: 2px 6px;
          background: rgba(168, 85, 247, 0.15);
          border-radius: 6px;
        }

        /* Animated gradient border for active learning */
        @keyframes gradient-border {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .mcp-learning-panel.expanded {
          border: 2px solid transparent;
          background: linear-gradient(var(--bg-card), var(--bg-card)) padding-box,
                      linear-gradient(90deg, var(--accent-purple), var(--accent-blue), var(--accent-cyan), var(--accent-purple)) border-box;
          background-size: 100% 100%, 300% 300%;
          animation: gradient-border 4s ease infinite;
        }

        /* ============================================= */
        /* CONSCIOUSNESS CONTROL CENTER                  */
        /* ============================================= */

        .consciousness-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
          min-height: 100%;
        }

        .glass {
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border);
        }

        .consciousness-view .view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-radius: var(--radius-xl);
        }

        .consciousness-view .view-header h2 {
          font-size: 24px;
          font-weight: 600;
          background: linear-gradient(135deg, var(--text-primary), var(--accent-purple));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-badges {
          display: flex;
          gap: 12px;
        }

        .state-badge {
          padding: 6px 14px;
          border-radius: var(--radius-full);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .connection-badge {
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-full);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .connection-badge.connected {
          background: rgba(34, 197, 94, 0.15);
          color: var(--accent-green);
        }

        .consciousness-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .consciousness-card {
          padding: 24px;
          border-radius: var(--radius-xl);
        }

        .consciousness-card h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Phi Gauge */
        .phi-card {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .phi-gauge {
          position: relative;
          flex-shrink: 0;
        }

        .phi-gauge-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }

        .phi-gauge-center .phi-symbol {
          display: block;
          font-size: 24px;
          font-weight: 300;
          color: var(--text-muted);
          margin-bottom: 4px;
        }

        .phi-gauge-center .phi-value {
          display: block;
          font-size: 32px;
          font-weight: 700;
          font-family: 'SF Mono', monospace;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .phi-meta .phi-label {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .phi-meta .phi-description {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        /* Phi Trend */
        .phi-trend {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 120px;
          padding: 8px 0;
        }

        .trend-bar {
          flex: 1;
          min-height: 4px;
          border-radius: 2px;
          transition: height 0.3s ease;
        }

        .trend-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 8px;
        }

        /* Integration Metrics */
        .integration-metrics {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .metric-row {
          display: grid;
          grid-template-columns: 140px 1fr 50px;
          align-items: center;
          gap: 16px;
        }

        .metric-label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .metric-bar {
          height: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          overflow: hidden;
        }

        .metric-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .metric-value {
          font-size: 14px;
          font-weight: 600;
          font-family: 'SF Mono', monospace;
          text-align: right;
        }

        /* Workspace Visualization */
        .workspace-viz {
          display: flex;
          justify-content: center;
          gap: 12px;
          padding: 24px 0;
        }

        .workspace-slot {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.03);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .slot-content {
          width: 28px;
          height: 28px;
          border-radius: 6px;
        }

        .workspace-info {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-muted);
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
        }

        /* ============================================= */
        /* NEUROMODULATION DASHBOARD                     */
        /* ============================================= */

        .neuromod-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
        }

        .neuromod-view .view-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          border-radius: var(--radius-xl);
        }

        .neuromod-view .subtitle {
          font-size: 14px;
          color: var(--text-muted);
        }

        .neuromod-aurora {
          height: 120px;
          border-radius: var(--radius-xl);
          overflow: hidden;
          position: relative;
        }

        .aurora-container {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }

        .aurora-band {
          width: 100%;
          filter: blur(20px);
        }

        .neuromod-channels {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .channel-card {
          padding: 20px;
          border-radius: var(--radius-xl);
          text-align: center;
        }

        .channel-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .channel-icon {
          font-size: 20px;
        }

        .channel-name {
          font-size: 14px;
          font-weight: 600;
        }

        .channel-gauge {
          position: relative;
          width: 100px;
          height: 100px;
          margin: 0 auto 12px;
        }

        .channel-gauge .gauge-value {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 20px;
          font-weight: 700;
          font-family: 'SF Mono', monospace;
        }

        .channel-effect {
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 12px;
        }

        .channel-bar {
          height: 4px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2px;
          overflow: hidden;
        }

        .channel-bar .bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s ease;
        }

        .neuromod-effects {
          padding: 24px;
          border-radius: var(--radius-xl);
        }

        .neuromod-effects h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .effects-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .effect-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: var(--radius-lg);
          text-align: center;
        }

        .effect-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .effect-value {
          font-size: 20px;
          font-weight: 700;
          font-family: 'SF Mono', monospace;
        }

        /* ============================================= */
        /* NESS ECONOMIC DASHBOARD                       */
        /* ============================================= */

        .ness-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
        }

        .ness-view .view-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          border-radius: var(--radius-xl);
        }

        .ness-view .subtitle {
          font-size: 14px;
          color: var(--text-muted);
        }

        .ness-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .ness-card {
          padding: 24px;
          border-radius: var(--radius-xl);
        }

        .ness-card h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .ness-gauge {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .ness-value {
          text-align: center;
          margin-top: -60px;
        }

        .ness-value .value {
          display: block;
          font-size: 36px;
          font-weight: 700;
          font-family: 'SF Mono', monospace;
          color: var(--text-primary);
        }

        .ness-value .label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .ness-indicators {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 20px;
        }

        .indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .indicator .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        /* Runway */
        .runway-display {
          text-align: center;
          margin-bottom: 20px;
        }

        .runway-days {
          font-size: 64px;
          font-weight: 700;
          font-family: 'SF Mono', monospace;
          background: linear-gradient(135deg, var(--accent-green), var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .runway-label {
          font-size: 16px;
          color: var(--text-muted);
          margin-left: 8px;
        }

        .runway-bar {
          height: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .runway-fill {
          height: 100%;
          border-radius: 6px;
          transition: width 0.5s ease;
        }

        .runway-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
        }

        /* Revenue Streams */
        .revenue-streams {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stream-row {
          display: grid;
          grid-template-columns: 100px 1fr 50px;
          align-items: center;
          gap: 12px;
        }

        .stream-name {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .stream-bar {
          height: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          overflow: hidden;
        }

        .stream-fill {
          height: 100%;
          border-radius: 4px;
        }

        .stream-value {
          font-size: 13px;
          font-weight: 600;
          font-family: 'SF Mono', monospace;
          text-align: right;
        }

        /* Q/Γ Ratio */
        .ratio-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          margin-bottom: 20px;
        }

        .ratio-item {
          text-align: center;
        }

        .ratio-label {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }

        .ratio-value {
          display: block;
          font-size: 28px;
          font-weight: 700;
          font-family: 'SF Mono', monospace;
        }

        .ratio-desc {
          display: block;
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .ratio-divider {
          font-size: 24px;
          color: var(--text-muted);
        }

        .ratio-bar {
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .ratio-left,
        .ratio-right {
          height: 100%;
        }

        .ratio-target {
          text-align: center;
          font-size: 11px;
          color: var(--text-muted);
        }

        @media (max-width: 1200px) {
          .consciousness-grid,
          .ness-grid {
            grid-template-columns: 1fr;
          }

          .neuromod-channels {
            grid-template-columns: repeat(2, 1fr);
          }

          .effects-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .neuromod-channels {
            grid-template-columns: 1fr;
          }

          .effects-grid {
            grid-template-columns: 1fr;
          }

          .phi-card {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
