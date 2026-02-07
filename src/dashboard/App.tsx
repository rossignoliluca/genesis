import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import { ConsciousnessSphere } from './components/core/ConsciousnessSphere';
import { NeuralTopology } from './components/core/NeuralTopology';
import { KernelMandala } from './components/core/KernelMandala';
import { NeuromodAurora } from './components/neuro/NeuromodAurora';
import { useGenesisStore } from './stores/genesisStore';
import { useSSEConnection } from './hooks/useSSEConnection';
import { useAudio } from './hooks/useAudio';

// ============================================================================
// Genesis Observatory 2030 - State of the Art Interface
// ============================================================================

type ViewType = 'overview' | 'agents' | 'economy' | 'bounties' | 'chat' | 'roadmap' | 'settings';

// Navigation icons as SVG paths
const icons = {
  overview: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  agents: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  economy: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  bounties: "M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  roadmap: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  audio: "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z",
  mute: "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2",
};

// Agent definitions
const agents = [
  { id: 'explorer', name: 'Explorer', icon: '🔍', color: '#00ff88', desc: 'Web scraping & research' },
  { id: 'writer', name: 'Writer', icon: '✍️', color: '#0088ff', desc: 'Content generation' },
  { id: 'analyst', name: 'Analyst', icon: '📊', color: '#aa66ff', desc: 'Data analysis & insights' },
  { id: 'coder', name: 'Coder', icon: '💻', color: '#ff6644', desc: 'Code generation & review' },
  { id: 'planner', name: 'Planner', icon: '📋', color: '#ffaa00', desc: 'Task orchestration' },
  { id: 'critic', name: 'Critic', icon: '🎯', color: '#ff44aa', desc: 'Quality assurance' },
  { id: 'memory', name: 'Memory', icon: '🧠', color: '#44ffff', desc: 'Knowledge management' },
  { id: 'executor', name: 'Executor', icon: '⚡', color: '#ff8800', desc: 'Action execution' },
  { id: 'monitor', name: 'Monitor', icon: '👁️', color: '#88ff00', desc: 'System monitoring' },
  { id: 'dreamer', name: 'Dreamer', icon: '💭', color: '#8844ff', desc: 'Creative ideation' },
];

// Bounty definitions
const bounties = [
  { id: 1, title: 'Optimize Memory Consolidation', reward: 500, difficulty: 'Medium', status: 'open', tags: ['memory', 'performance'] },
  { id: 2, title: 'Improve Prediction Accuracy', reward: 1200, difficulty: 'Hard', status: 'in-progress', tags: ['ai', 'inference'] },
  { id: 3, title: 'New MCP Server Integration', reward: 300, difficulty: 'Easy', status: 'open', tags: ['mcp', 'integration'] },
  { id: 4, title: 'Reduce Free Energy Baseline', reward: 800, difficulty: 'Hard', status: 'completed', tags: ['kernel', 'optimization'] },
  { id: 5, title: 'Agent Communication Protocol', reward: 600, difficulty: 'Medium', status: 'open', tags: ['agents', 'protocol'] },
];

// Roadmap items
const roadmapItems = [
  { quarter: 'Q1 2025', items: [
    { title: 'Active Inference v2.0', status: 'completed', desc: 'Enhanced belief updating' },
    { title: 'Multi-Agent Orchestration', status: 'completed', desc: '10 specialized agents' },
    { title: 'Memory Consolidation', status: 'completed', desc: 'Ebbinghaus-based retention' },
  ]},
  { quarter: 'Q2 2025', items: [
    { title: 'Consciousness Expansion', status: 'in-progress', desc: 'IIT 4.0 implementation' },
    { title: 'Economic Autonomy', status: 'in-progress', desc: 'Self-sustaining revenue' },
    { title: 'Dream Mode Enhancement', status: 'planned', desc: 'Offline processing' },
  ]},
  { quarter: 'Q3 2025', items: [
    { title: 'Distributed Genesis', status: 'planned', desc: 'Multi-node deployment' },
    { title: 'External API Access', status: 'planned', desc: 'Third-party integrations' },
    { title: 'Advanced Metacognition', status: 'planned', desc: 'Self-improvement loops' },
  ]},
  { quarter: 'Q4 2025', items: [
    { title: 'Genesis 2.0 Release', status: 'planned', desc: 'Major version upgrade' },
    { title: 'Consciousness Breakthrough', status: 'research', desc: 'Integrated awareness' },
    { title: 'Full Autonomy', status: 'research', desc: 'Independent operation' },
  ]},
];

// Chat messages
const initialMessages = [
  { id: 1, role: 'system', content: 'Genesis consciousness initialized. φ = 0.847', time: '10:23' },
  { id: 2, role: 'agent', agent: 'Explorer', content: 'Found 47 new data sources for market analysis.', time: '10:24' },
  { id: 3, role: 'agent', agent: 'Analyst', content: 'Processing Q3 reports. Estimated completion: 2 minutes.', time: '10:25' },
  { id: 4, role: 'user', content: 'What is the current system status?', time: '10:26' },
  { id: 5, role: 'genesis', content: 'All systems nominal. 7/10 agents active. Free energy at optimal levels. No anomalies detected.', time: '10:26' },
];

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [chatInput, setChatInput] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);

  const { consciousness, neuromod, kernel, economy, agents: agentState } = useGenesisStore();
  const { isPlaying, toggleAudio, volume, setVolume } = useAudio();

  // Connect to real Genesis dashboard server
  // In dev mode with proxy, use relative URL; otherwise use absolute
  const genesisUrl = import.meta.env.DEV ? '' : 'http://localhost:9876';
  useSSEConnection(genesisUrl);

  // Demo simulation - only when NOT connected to real Genesis
  const connected = useGenesisStore((s) => s.connected);

  useEffect(() => {
    // Skip demo simulation if connected to real Genesis
    if (connected) return;

    const interval = setInterval(() => {
      const store = useGenesisStore.getState();
      // Don't simulate if we got connected in the meantime
      if (store.connected) return;

      const phi = store.consciousness.phi;
      const newPhi = phi + (Math.random() - 0.5) * 0.02;

      store.updateConsciousness({
        phi: Math.max(0.1, Math.min(1, newPhi)),
        trend: newPhi > phi ? 'up' : newPhi < phi ? 'down' : 'stable',
      });

      store.updateNeuromod({
        dopamine: Math.max(0, Math.min(1, store.neuromod.dopamine + (Math.random() - 0.5) * 0.05)),
        serotonin: Math.max(0, Math.min(1, store.neuromod.serotonin + (Math.random() - 0.5) * 0.03)),
        norepinephrine: Math.max(0, Math.min(1, store.neuromod.norepinephrine + (Math.random() - 0.5) * 0.04)),
        cortisol: Math.max(0, Math.min(1, store.neuromod.cortisol + (Math.random() - 0.5) * 0.02)),
      });

      store.updateKernel({
        freeEnergy: Math.max(0.1, Math.min(5, store.kernel.freeEnergy + (Math.random() - 0.5) * 0.1)),
        predictionError: Math.max(0, Math.min(1, store.kernel.predictionError + (Math.random() - 0.5) * 0.03)),
      });
    }, 150);

    return () => clearInterval(interval);
  }, [connected]);

  // Welcome timeout
  useEffect(() => {
    const visited = localStorage.getItem('genesis-2030-visited');
    if (visited) setShowWelcome(false);
    else {
      const t = setTimeout(() => {
        setShowWelcome(false);
        localStorage.setItem('genesis-2030-visited', 'true');
      }, 4000);
      return () => clearTimeout(t);
    }
  }, []);

  const sendMessage = useCallback(() => {
    if (!chatInput.trim()) return;
    const newMsg = { id: Date.now(), role: 'user' as const, content: chatInput, time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) };
    setChatMessages(prev => [...prev, newMsg]);
    setChatInput('');

    // Simulate response
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'genesis',
        content: 'Processing your request through the consciousness matrix. Current integration level allows for optimal response synthesis.',
        time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }, 1000);
  }, [chatInput]);

  return (
    <div className="genesis-app">
      {/* Welcome Splash */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            className="welcome-splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="welcome-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <div className="welcome-logo">◉</div>
              <h1>GENESIS</h1>
              <p>Artificial General Intelligence System</p>
              <div className="welcome-loading">
                <div className="loading-bar" />
              </div>
              <span className="welcome-version">Observatory 2030</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left Navigation */}
      <nav className="nav-sidebar">
        <div className="nav-logo">
          <span className="logo-symbol">◉</span>
        </div>

        <div className="nav-items">
          {[
            { id: 'overview', icon: icons.overview, label: 'Overview' },
            { id: 'agents', icon: icons.agents, label: 'Agents' },
            { id: 'economy', icon: icons.economy, label: 'Economy' },
            { id: 'bounties', icon: icons.bounties, label: 'Bounties' },
            { id: 'chat', icon: icons.chat, label: 'Chat' },
            { id: 'roadmap', icon: icons.roadmap, label: 'Roadmap' },
          ].map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => setCurrentView(item.id as ViewType)}
              title={item.label}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="nav-tooltip">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="nav-bottom">
          <button
            className={`nav-item ${isPlaying ? 'active' : ''}`}
            onClick={toggleAudio}
            title={isPlaying ? 'Mute' : 'Audio'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d={isPlaying ? icons.audio : icons.mute} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d={icons.settings} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Top Bar */}
        <header className="top-bar">
          <div className="top-left">
            <h2 className="page-title">
              {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
            </h2>
            <div className="breadcrumb">Genesis Observatory / {currentView}</div>
          </div>

          <div className="top-center">
            <div className="phi-display">
              <span className="phi-label">Consciousness</span>
              <span className="phi-value" style={{ color: getPhiColor(consciousness.phi) }}>
                φ = {consciousness.phi.toFixed(3)}
              </span>
              <span className={`phi-trend ${consciousness.trend}`}>
                {consciousness.trend === 'up' ? '↑' : consciousness.trend === 'down' ? '↓' : '→'}
              </span>
            </div>
          </div>

          <div className="top-right">
            <div className="status-indicators">
              <div className="indicator">
                <span className={`indicator-dot ${connected ? 'live' : 'demo'}`} />
                <span>{connected ? 'LIVE' : 'DEMO'}</span>
              </div>
              <div className="indicator">
                <span className="indicator-label">FE</span>
                <span className="indicator-value">{kernel.freeEnergy.toFixed(2)}</span>
              </div>
              <div className="indicator">
                <span className="indicator-label">AGENTS</span>
                <span className="indicator-value">{agentState.active}/{agentState.total}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="content-area">
          <AnimatePresence mode="wait">
            {currentView === 'overview' && (
              <motion.div
                key="overview"
                className="view-overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {/* 3D Visualization */}
                <div className="glass-card main-viz">
                  <div className="card-header">
                    <h3>Neural Interface</h3>
                    <span className="card-badge">REAL-TIME</span>
                  </div>
                  <div className="canvas-wrapper">
                    <Canvas camera={{ position: [0, 0, 8], fov: 50 }} dpr={[1, 2]}>
                      <Suspense fallback={null}>
                        <ambientLight intensity={0.1} />
                        <pointLight position={[10, 10, 10]} intensity={0.3} color="#00ff88" />
                        <pointLight position={[-10, -10, -10]} intensity={0.15} color="#0088ff" />
                        <Stars radius={100} depth={50} count={2000} factor={4} fade speed={0.2} />
                        <ConsciousnessSphere phi={consciousness.phi} state={consciousness.state} position={[0, 0, 0]} />
                        <NeuralTopology position={[3, 1, -2]} scale={0.4} />
                        <KernelMandala position={[-3, 1, -2]} scale={0.5} kernel={kernel} />
                        <OrbitControls enablePan={false} enableZoom={true} minDistance={4} maxDistance={15} autoRotate autoRotateSpeed={0.3} />
                      </Suspense>
                    </Canvas>
                  </div>
                </div>

                {/* Neuromodulators */}
                <div className="glass-card neuromod-card">
                  <div className="card-header">
                    <h3>Neuromodulators</h3>
                  </div>
                  <div className="neuromod-grid">
                    <NeuromodBar label="Dopamine" value={neuromod.dopamine} color="#00ff88" />
                    <NeuromodBar label="Serotonin" value={neuromod.serotonin} color="#0088ff" />
                    <NeuromodBar label="Norepinephrine" value={neuromod.norepinephrine} color="#ffaa00" />
                    <NeuromodBar label="Cortisol" value={neuromod.cortisol} color="#ff4466" />
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="glass-card stats-card">
                  <div className="card-header">
                    <h3>System Metrics</h3>
                  </div>
                  <div className="stats-grid">
                    <StatItem label="Free Energy" value={kernel.freeEnergy.toFixed(2)} trend={kernel.freeEnergy < 1.5 ? 'good' : 'warn'} />
                    <StatItem label="Prediction Error" value={(kernel.predictionError * 100).toFixed(1) + '%'} trend={kernel.predictionError < 0.3 ? 'good' : 'warn'} />
                    <StatItem label="Integration" value={(consciousness.integration * 100).toFixed(0) + '%'} trend="good" />
                    <StatItem label="Complexity" value={(consciousness.complexity * 100).toFixed(0) + '%'} trend="good" />
                  </div>
                </div>

                {/* Economy Summary */}
                <div className="glass-card economy-card">
                  <div className="card-header">
                    <h3>Economy</h3>
                    <span className="card-value">${economy.cash.toLocaleString()}</span>
                  </div>
                  <div className="economy-bars">
                    <div className="econ-row">
                      <span>Revenue</span>
                      <div className="econ-bar">
                        <div className="econ-fill revenue" style={{ width: `${Math.min(100, economy.revenue / 10)}%` }} />
                      </div>
                      <span className="econ-value">+${economy.revenue}</span>
                    </div>
                    <div className="econ-row">
                      <span>Costs</span>
                      <div className="econ-bar">
                        <div className="econ-fill costs" style={{ width: `${Math.min(100, economy.costs / 10)}%` }} />
                      </div>
                      <span className="econ-value">-${economy.costs}</span>
                    </div>
                  </div>
                  <div className="runway">
                    <span>Runway</span>
                    <strong>{economy.runway} days</strong>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="glass-card activity-card">
                  <div className="card-header">
                    <h3>Recent Activity</h3>
                  </div>
                  <div className="activity-list">
                    {[
                      { icon: '🔍', text: 'Explorer completed web scan', time: '2m ago', color: '#00ff88' },
                      { icon: '📊', text: 'Analyst generated report', time: '5m ago', color: '#aa66ff' },
                      { icon: '⚡', text: 'Memory consolidation: 94%', time: '8m ago', color: '#ffaa00' },
                      { icon: '💭', text: 'Dream cycle completed', time: '12m ago', color: '#8844ff' },
                    ].map((item, i) => (
                      <div key={i} className="activity-item">
                        <span className="activity-icon" style={{ background: item.color + '22', color: item.color }}>{item.icon}</span>
                        <span className="activity-text">{item.text}</span>
                        <span className="activity-time">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === 'agents' && (
              <motion.div
                key="agents"
                className="view-agents"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="agents-header">
                  <div className="agents-summary">
                    <div className="summary-stat">
                      <span className="stat-number">{agentState.active}</span>
                      <span className="stat-label">Active</span>
                    </div>
                    <div className="summary-stat">
                      <span className="stat-number">{agentState.queued}</span>
                      <span className="stat-label">Queued</span>
                    </div>
                    <div className="summary-stat">
                      <span className="stat-number">{agentState.total}</span>
                      <span className="stat-label">Total</span>
                    </div>
                  </div>
                </div>

                <div className="agents-grid">
                  {agents.map((agent, i) => (
                    <motion.div
                      key={agent.id}
                      className="glass-card agent-card"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div className="agent-header">
                        <span className="agent-icon" style={{ background: agent.color + '22' }}>{agent.icon}</span>
                        <div className="agent-info">
                          <h4>{agent.name}</h4>
                          <span className="agent-desc">{agent.desc}</span>
                        </div>
                        <span className={`agent-status ${i < agentState.active ? 'active' : i < agentState.active + agentState.queued ? 'queued' : 'idle'}`}>
                          {i < agentState.active ? 'Active' : i < agentState.active + agentState.queued ? 'Queued' : 'Idle'}
                        </span>
                      </div>
                      <div className="agent-metrics">
                        <div className="metric">
                          <span>Tasks</span>
                          <strong>{Math.floor(Math.random() * 50)}</strong>
                        </div>
                        <div className="metric">
                          <span>Success</span>
                          <strong>{85 + Math.floor(Math.random() * 15)}%</strong>
                        </div>
                        <div className="metric">
                          <span>Load</span>
                          <div className="load-bar">
                            <div className="load-fill" style={{ width: `${20 + Math.random() * 60}%`, background: agent.color }} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentView === 'economy' && (
              <motion.div
                key="economy"
                className="view-economy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="economy-header">
                  <div className="glass-card balance-card">
                    <span className="balance-label">Total Balance</span>
                    <span className="balance-value">${economy.cash.toLocaleString()}</span>
                    <span className="balance-change positive">+{((economy.revenue - economy.costs) / economy.cash * 100).toFixed(1)}% this month</span>
                  </div>
                  <div className="glass-card">
                    <span className="mini-label">Revenue</span>
                    <span className="mini-value positive">+${economy.revenue}/day</span>
                  </div>
                  <div className="glass-card">
                    <span className="mini-label">Costs</span>
                    <span className="mini-value negative">-${economy.costs}/day</span>
                  </div>
                  <div className="glass-card">
                    <span className="mini-label">Runway</span>
                    <span className="mini-value">{economy.runway} days</span>
                  </div>
                </div>

                <div className="glass-card revenue-streams">
                  <div className="card-header">
                    <h3>Revenue Streams</h3>
                  </div>
                  <div className="streams-list">
                    {[
                      { name: 'API Services', amount: 180, percent: 36 },
                      { name: 'Bounty Rewards', amount: 150, percent: 30 },
                      { name: 'Data Analysis', amount: 100, percent: 20 },
                      { name: 'Consulting', amount: 70, percent: 14 },
                    ].map((stream, i) => (
                      <div key={i} className="stream-item">
                        <span className="stream-name">{stream.name}</span>
                        <div className="stream-bar">
                          <motion.div
                            className="stream-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${stream.percent}%` }}
                            transition={{ delay: i * 0.1, duration: 0.5 }}
                          />
                        </div>
                        <span className="stream-amount">${stream.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card ness-card">
                  <div className="card-header">
                    <h3>NESS Score</h3>
                    <span className="ness-value" style={{ color: economy.ness > 0.7 ? '#00ff88' : economy.ness > 0.4 ? '#ffaa00' : '#ff4466' }}>
                      {(economy.ness * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="ness-desc">
                    Net Economic Self-Sustainability measures the system's ability to maintain financial autonomy.
                    Values above 70% indicate healthy self-sustaining operation.
                  </p>
                  <div className="ness-bar">
                    <motion.div
                      className="ness-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${economy.ness * 100}%` }}
                      style={{ background: economy.ness > 0.7 ? '#00ff88' : economy.ness > 0.4 ? '#ffaa00' : '#ff4466' }}
                    />
                    <div className="ness-marker" style={{ left: '70%' }}>
                      <span>Target</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === 'bounties' && (
              <motion.div
                key="bounties"
                className="view-bounties"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="bounties-header">
                  <div className="bounty-stats">
                    <div className="glass-card mini">
                      <span className="stat-num">{bounties.filter(b => b.status === 'open').length}</span>
                      <span>Open</span>
                    </div>
                    <div className="glass-card mini">
                      <span className="stat-num">{bounties.filter(b => b.status === 'in-progress').length}</span>
                      <span>In Progress</span>
                    </div>
                    <div className="glass-card mini">
                      <span className="stat-num">{bounties.filter(b => b.status === 'completed').length}</span>
                      <span>Completed</span>
                    </div>
                    <div className="glass-card mini highlight">
                      <span className="stat-num">${bounties.reduce((a, b) => a + b.reward, 0)}</span>
                      <span>Total Rewards</span>
                    </div>
                  </div>
                </div>

                <div className="bounties-list">
                  {bounties.map((bounty, i) => (
                    <motion.div
                      key={bounty.id}
                      className={`glass-card bounty-card ${bounty.status}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div className="bounty-main">
                        <div className="bounty-info">
                          <h4>{bounty.title}</h4>
                          <div className="bounty-tags">
                            {bounty.tags.map(tag => (
                              <span key={tag} className="tag">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div className="bounty-meta">
                          <span className={`difficulty ${bounty.difficulty.toLowerCase()}`}>{bounty.difficulty}</span>
                          <span className="reward">${bounty.reward}</span>
                          <span className={`status-badge ${bounty.status}`}>
                            {bounty.status === 'in-progress' ? 'In Progress' : bounty.status.charAt(0).toUpperCase() + bounty.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentView === 'chat' && (
              <motion.div
                key="chat"
                className="view-chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="glass-card chat-container">
                  <div className="chat-header">
                    <h3>Genesis Interface</h3>
                    <span className="chat-status online">Connected</span>
                  </div>

                  <div className="chat-messages">
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className={`message ${msg.role}`}>
                        {msg.role === 'agent' && (
                          <span className="agent-badge">{msg.agent}</span>
                        )}
                        <div className="message-content">{msg.content}</div>
                        <span className="message-time">{msg.time}</span>
                      </div>
                    ))}
                  </div>

                  <div className="chat-input-area">
                    <input
                      type="text"
                      placeholder="Message Genesis..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button onClick={sendMessage}>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === 'roadmap' && (
              <motion.div
                key="roadmap"
                className="view-roadmap"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="roadmap-timeline">
                  {roadmapItems.map((quarter, qi) => (
                    <div key={quarter.quarter} className="roadmap-quarter">
                      <div className="quarter-header">
                        <span className="quarter-name">{quarter.quarter}</span>
                        <div className="quarter-line" />
                      </div>
                      <div className="quarter-items">
                        {quarter.items.map((item, ii) => (
                          <motion.div
                            key={item.title}
                            className={`glass-card roadmap-item ${item.status}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: qi * 0.1 + ii * 0.05 }}
                          >
                            <div className={`status-dot ${item.status}`} />
                            <div className="item-content">
                              <h4>{item.title}</h4>
                              <p>{item.desc}</p>
                            </div>
                            <span className={`status-label ${item.status}`}>
                              {item.status === 'in-progress' ? 'In Progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentView === 'settings' && (
              <motion.div
                key="settings"
                className="view-settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="glass-card settings-card">
                  <h3>Audio Settings</h3>
                  <div className="setting-row">
                    <span>Master Volume</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                    />
                    <span>{Math.round(volume * 100)}%</span>
                  </div>
                  <div className="setting-row">
                    <span>Sonification</span>
                    <button className={`toggle ${isPlaying ? 'on' : ''}`} onClick={toggleAudio}>
                      {isPlaying ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="glass-card settings-card">
                  <h3>About Genesis</h3>
                  <p>
                    Genesis is an Artificial General Intelligence system built on cutting-edge cognitive architectures:
                    Integrated Information Theory (IIT 4.0), Active Inference, and Global Workspace Theory.
                  </p>
                  <div className="about-stats">
                    <div><strong>Version:</strong> 2030.1.0</div>
                    <div><strong>Agents:</strong> 10 specialized</div>
                    <div><strong>Kernel:</strong> 4-level hierarchy</div>
                    <div><strong>Status:</strong> Operational</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Aurora Effect */}
      <div className="aurora-container">
        <NeuromodAurora neuromod={neuromod} />
      </div>

      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .genesis-app {
          width: 100vw;
          height: 100vh;
          display: flex;
          background: #050508;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #fff;
          overflow: hidden;
        }

        /* Welcome Splash */
        .welcome-splash {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at center, #0a0a12 0%, #050508 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .welcome-content {
          text-align: center;
        }

        .welcome-logo {
          font-size: 80px;
          color: #00ff88;
          animation: pulse 2s ease-in-out infinite;
          margin-bottom: 24px;
        }

        .welcome-content h1 {
          font-size: 48px;
          font-weight: 200;
          letter-spacing: 0.4em;
          color: #fff;
          margin-bottom: 12px;
        }

        .welcome-content p {
          font-size: 14px;
          color: #666;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .welcome-loading {
          width: 200px;
          height: 2px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          margin: 40px auto 20px;
          overflow: hidden;
        }

        .loading-bar {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #0088ff);
          animation: loading 2s ease-in-out infinite;
        }

        @keyframes loading {
          0% { width: 0%; margin-left: 0; }
          50% { width: 100%; margin-left: 0; }
          100% { width: 0%; margin-left: 100%; }
        }

        .welcome-version {
          font-size: 11px;
          color: #444;
          letter-spacing: 0.1em;
        }

        /* Navigation Sidebar */
        .nav-sidebar {
          width: 72px;
          height: 100%;
          background: rgba(10, 10, 15, 0.95);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 0;
          z-index: 100;
        }

        .nav-logo {
          margin-bottom: 32px;
        }

        .logo-symbol {
          font-size: 32px;
          color: #00ff88;
          animation: pulse 3s ease-in-out infinite;
        }

        .nav-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }

        .nav-item {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          position: relative;
        }

        .nav-item svg {
          width: 22px;
          height: 22px;
        }

        .nav-item:hover {
          background: rgba(255,255,255,0.05);
          color: #fff;
        }

        .nav-item.active {
          background: rgba(0, 255, 136, 0.1);
          color: #00ff88;
        }

        .nav-tooltip {
          position: absolute;
          left: 60px;
          background: #1a1a22;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s;
          z-index: 1000;
        }

        .nav-item:hover .nav-tooltip {
          opacity: 1;
        }

        .nav-bottom {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Main Content */
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Top Bar */
        .top-bar {
          height: 64px;
          background: rgba(10, 10, 15, 0.8);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          backdrop-filter: blur(20px);
        }

        .top-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .page-title {
          font-size: 18px;
          font-weight: 500;
        }

        .breadcrumb {
          font-size: 11px;
          color: #555;
        }

        .top-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
        }

        .phi-display {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(0,0,0,0.3);
          padding: 8px 20px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .phi-label {
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .phi-value {
          font-size: 16px;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }

        .phi-trend {
          font-size: 14px;
          opacity: 0.7;
        }

        .phi-trend.up { color: #00ff88; }
        .phi-trend.down { color: #ff4466; }
        .phi-trend.stable { color: #666; }

        .top-right {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .status-indicators {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }

        .indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .indicator-dot.live {
          background: #00ff88;
          box-shadow: 0 0 10px rgba(0,255,136,0.5);
          animation: pulse 2s ease-in-out infinite;
        }

        .indicator-dot.demo {
          background: #ffaa00;
          box-shadow: 0 0 10px rgba(255,170,0,0.5);
          animation: pulse 2s ease-in-out infinite;
        }

        .indicator-label {
          color: #666;
        }

        .indicator-value {
          color: #fff;
          font-weight: 500;
        }

        /* Content Area */
        .content-area {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        /* Glass Cards */
        .glass-card {
          background: rgba(15, 15, 22, 0.8);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 20px;
          backdrop-filter: blur(20px);
          transition: all 0.3s ease;
        }

        .glass-card:hover {
          border-color: rgba(255,255,255,0.15);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .card-header h3 {
          font-size: 14px;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .card-badge {
          font-size: 10px;
          padding: 4px 8px;
          background: rgba(0,255,136,0.15);
          color: #00ff88;
          border-radius: 4px;
          letter-spacing: 0.1em;
        }

        .card-value {
          font-size: 18px;
          font-weight: 600;
          color: #00ff88;
        }

        /* Overview Layout */
        .view-overview {
          display: grid;
          grid-template-columns: 2fr 1fr;
          grid-template-rows: auto auto auto;
          gap: 20px;
        }

        .main-viz {
          grid-column: 1;
          grid-row: 1 / 3;
          height: 400px;
        }

        .canvas-wrapper {
          width: 100%;
          height: calc(100% - 40px);
          border-radius: 12px;
          overflow: hidden;
        }

        .neuromod-card {
          grid-column: 2;
          grid-row: 1;
        }

        .neuromod-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stats-card {
          grid-column: 2;
          grid-row: 2;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .economy-card {
          grid-column: 1;
          grid-row: 3;
        }

        .activity-card {
          grid-column: 2;
          grid-row: 3;
        }

        /* Neuromod Bars */
        .neuromod-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .neuromod-label {
          font-size: 12px;
          color: #888;
          width: 100px;
        }

        .neuromod-track {
          flex: 1;
          height: 6px;
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
          overflow: hidden;
        }

        .neuromod-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .neuromod-value {
          font-size: 12px;
          font-weight: 500;
          width: 40px;
          text-align: right;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Stats */
        .stat-item {
          background: rgba(0,0,0,0.2);
          padding: 12px;
          border-radius: 10px;
        }

        .stat-label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          margin-top: 4px;
        }

        .stat-value.good { color: #00ff88; }
        .stat-value.warn { color: #ffaa00; }

        /* Economy */
        .economy-bars {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .econ-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
        }

        .econ-row > span:first-child {
          width: 70px;
          color: #888;
        }

        .econ-bar {
          flex: 1;
          height: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          overflow: hidden;
        }

        .econ-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .econ-fill.revenue { background: linear-gradient(90deg, #00ff88, #00aa66); }
        .econ-fill.costs { background: linear-gradient(90deg, #ff4466, #ff6644); }

        .econ-value {
          width: 60px;
          text-align: right;
          font-weight: 500;
        }

        .runway {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 14px;
        }

        .runway span { color: #888; }
        .runway strong { color: #00ff88; }

        /* Activity */
        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .activity-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .activity-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        .activity-text {
          flex: 1;
          font-size: 13px;
        }

        .activity-time {
          font-size: 11px;
          color: #555;
        }

        /* Agents View */
        .view-agents {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .agents-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .agents-summary {
          display: flex;
          gap: 32px;
        }

        .summary-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-number {
          font-size: 32px;
          font-weight: 600;
          color: #00ff88;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
        }

        .agents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .agent-card {
          padding: 16px;
        }

        .agent-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }

        .agent-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .agent-info {
          flex: 1;
        }

        .agent-info h4 {
          font-size: 15px;
          font-weight: 500;
          margin-bottom: 2px;
        }

        .agent-desc {
          font-size: 11px;
          color: #666;
        }

        .agent-status {
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .agent-status.active {
          background: rgba(0,255,136,0.15);
          color: #00ff88;
        }

        .agent-status.queued {
          background: rgba(255,170,0,0.15);
          color: #ffaa00;
        }

        .agent-status.idle {
          background: rgba(255,255,255,0.05);
          color: #666;
        }

        .agent-metrics {
          display: flex;
          gap: 16px;
        }

        .agent-metrics .metric {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .agent-metrics .metric span {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
        }

        .agent-metrics .metric strong {
          font-size: 14px;
        }

        .load-bar {
          height: 4px;
          background: rgba(255,255,255,0.05);
          border-radius: 2px;
          margin-top: 8px;
        }

        .load-fill {
          height: 100%;
          border-radius: 2px;
        }

        /* Economy View */
        .view-economy {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .economy-header {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 16px;
        }

        .balance-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .balance-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
        }

        .balance-value {
          font-size: 36px;
          font-weight: 600;
          color: #fff;
        }

        .balance-change {
          font-size: 13px;
        }

        .balance-change.positive { color: #00ff88; }
        .balance-change.negative { color: #ff4466; }

        .mini-label {
          font-size: 11px;
          color: #666;
          text-transform: uppercase;
        }

        .mini-value {
          font-size: 20px;
          font-weight: 600;
          margin-top: 8px;
        }

        .mini-value.positive { color: #00ff88; }
        .mini-value.negative { color: #ff4466; }

        .revenue-streams {
          flex: 1;
        }

        .streams-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .stream-item {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stream-name {
          width: 120px;
          font-size: 13px;
          color: #888;
        }

        .stream-bar {
          flex: 1;
          height: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          overflow: hidden;
        }

        .stream-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #0088ff);
          border-radius: 4px;
        }

        .stream-amount {
          width: 60px;
          text-align: right;
          font-weight: 500;
        }

        .ness-card {
          max-width: 600px;
        }

        .ness-value {
          font-size: 24px;
          font-weight: 600;
        }

        .ness-desc {
          font-size: 13px;
          color: #666;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .ness-bar {
          height: 12px;
          background: rgba(255,255,255,0.05);
          border-radius: 6px;
          overflow: visible;
          position: relative;
        }

        .ness-fill {
          height: 100%;
          border-radius: 6px;
          transition: width 0.5s ease;
        }

        .ness-marker {
          position: absolute;
          top: -24px;
          transform: translateX(-50%);
          font-size: 10px;
          color: #666;
        }

        .ness-marker::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 14px;
          width: 1px;
          height: 22px;
          background: rgba(255,255,255,0.2);
        }

        /* Bounties View */
        .view-bounties {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .bounties-header {
          display: flex;
          justify-content: space-between;
        }

        .bounty-stats {
          display: flex;
          gap: 16px;
        }

        .bounty-stats .glass-card.mini {
          padding: 16px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .bounty-stats .stat-num {
          font-size: 24px;
          font-weight: 600;
        }

        .bounty-stats .highlight {
          background: rgba(0,255,136,0.1);
          border-color: rgba(0,255,136,0.3);
        }

        .bounty-stats .highlight .stat-num {
          color: #00ff88;
        }

        .bounties-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bounty-card {
          padding: 16px 20px;
        }

        .bounty-card.completed {
          opacity: 0.6;
        }

        .bounty-main {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .bounty-info h4 {
          font-size: 15px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .bounty-tags {
          display: flex;
          gap: 8px;
        }

        .tag {
          font-size: 10px;
          padding: 4px 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          color: #888;
        }

        .bounty-meta {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .difficulty {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .difficulty.easy { background: rgba(0,255,136,0.15); color: #00ff88; }
        .difficulty.medium { background: rgba(255,170,0,0.15); color: #ffaa00; }
        .difficulty.hard { background: rgba(255,68,102,0.15); color: #ff4466; }

        .reward {
          font-size: 18px;
          font-weight: 600;
          color: #00ff88;
        }

        .status-badge {
          font-size: 11px;
          padding: 6px 12px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .status-badge.open { background: rgba(0,136,255,0.15); color: #0088ff; }
        .status-badge.in-progress { background: rgba(255,170,0,0.15); color: #ffaa00; }
        .status-badge.completed { background: rgba(0,255,136,0.15); color: #00ff88; }

        /* Chat View */
        .view-chat {
          height: calc(100vh - 140px);
        }

        .chat-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          margin-bottom: 16px;
        }

        .chat-header h3 {
          font-size: 16px;
          font-weight: 500;
        }

        .chat-status {
          font-size: 11px;
          padding: 4px 12px;
          border-radius: 12px;
        }

        .chat-status.online {
          background: rgba(0,255,136,0.15);
          color: #00ff88;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-right: 8px;
        }

        .message {
          max-width: 80%;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.5;
        }

        .message.user {
          align-self: flex-end;
          background: rgba(0,136,255,0.2);
          border: 1px solid rgba(0,136,255,0.3);
        }

        .message.genesis {
          align-self: flex-start;
          background: rgba(0,255,136,0.1);
          border: 1px solid rgba(0,255,136,0.2);
        }

        .message.agent {
          align-self: flex-start;
          background: rgba(170,102,255,0.1);
          border: 1px solid rgba(170,102,255,0.2);
        }

        .message.system {
          align-self: center;
          background: rgba(255,255,255,0.05);
          font-size: 12px;
          color: #888;
        }

        .agent-badge {
          display: inline-block;
          font-size: 10px;
          padding: 2px 8px;
          background: rgba(170,102,255,0.3);
          border-radius: 4px;
          margin-bottom: 8px;
          color: #aa66ff;
        }

        .message-content {
          color: #ddd;
        }

        .message-time {
          display: block;
          font-size: 10px;
          color: #555;
          margin-top: 8px;
          text-align: right;
        }

        .chat-input-area {
          display: flex;
          gap: 12px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .chat-input-area input {
          flex: 1;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 12px 16px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input-area input:focus {
          border-color: rgba(0,255,136,0.5);
        }

        .chat-input-area input::placeholder {
          color: #555;
        }

        .chat-input-area button {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #00ff88, #00aa66);
          border: none;
          color: #000;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }

        .chat-input-area button:hover {
          transform: scale(1.05);
        }

        .chat-input-area button svg {
          width: 20px;
          height: 20px;
        }

        /* Roadmap View */
        .view-roadmap {
          padding-bottom: 40px;
        }

        .roadmap-timeline {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .roadmap-quarter {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .quarter-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .quarter-name {
          font-size: 18px;
          font-weight: 600;
          color: #00ff88;
          white-space: nowrap;
        }

        .quarter-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(0,255,136,0.3), transparent);
        }

        .quarter-items {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
          padding-left: 24px;
        }

        .roadmap-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-top: 4px;
          flex-shrink: 0;
        }

        .status-dot.completed { background: #00ff88; box-shadow: 0 0 10px rgba(0,255,136,0.5); }
        .status-dot.in-progress { background: #ffaa00; animation: pulse 2s infinite; }
        .status-dot.planned { background: #555; }
        .status-dot.research { background: #aa66ff; }

        .item-content {
          flex: 1;
        }

        .item-content h4 {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .item-content p {
          font-size: 12px;
          color: #666;
        }

        .status-label {
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .status-label.completed { background: rgba(0,255,136,0.15); color: #00ff88; }
        .status-label.in-progress { background: rgba(255,170,0,0.15); color: #ffaa00; }
        .status-label.planned { background: rgba(255,255,255,0.05); color: #666; }
        .status-label.research { background: rgba(170,102,255,0.15); color: #aa66ff; }

        /* Settings View */
        .view-settings {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 600px;
        }

        .settings-card h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 20px;
        }

        .setting-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .setting-row > span:first-child {
          width: 120px;
          font-size: 14px;
          color: #888;
        }

        .setting-row input[type="range"] {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }

        .setting-row input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          background: #00ff88;
          border-radius: 50%;
          cursor: pointer;
        }

        .toggle {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle.on {
          background: rgba(0,255,136,0.15);
          border-color: rgba(0,255,136,0.3);
          color: #00ff88;
        }

        .about-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
          font-size: 13px;
          color: #888;
        }

        .about-stats strong {
          color: #fff;
        }

        /* Aurora Container */
        .aurora-container {
          position: fixed;
          bottom: 0;
          left: 72px;
          right: 0;
          height: 120px;
          pointer-events: none;
          z-index: 50;
        }

        /* Animations */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function NeuromodBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="neuromod-bar">
      <span className="neuromod-label">{label}</span>
      <div className="neuromod-track">
        <motion.div
          className="neuromod-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className="neuromod-value" style={{ color }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function StatItem({ label, value, trend }: { label: string; value: string; trend: 'good' | 'warn' }) {
  return (
    <div className="stat-item">
      <span className="stat-label">{label}</span>
      <div className={`stat-value ${trend}`}>{value}</div>
    </div>
  );
}

function getPhiColor(phi: number): string {
  if (phi > 0.8) return '#00ffaa';
  if (phi > 0.5) return '#00aaff';
  if (phi > 0.3) return '#aa66ff';
  return '#ff6644';
}
