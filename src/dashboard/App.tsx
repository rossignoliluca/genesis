import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, Float, Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import { useGenesisStore } from './stores/genesisStore';
import { useSSEConnection } from './hooks/useSSEConnection';

// ============================================================================
// GENESIS - Full Interactive Web Interface
// ============================================================================

type View = 'overview' | 'chat' | 'agents' | 'tasks' | 'creator' | 'terminal' | 'analytics' | 'files' | 'memory' | 'settings';

// Icons as simple components
const Icons = {
  overview: () => <span>◉</span>,
  chat: () => <span>◈</span>,
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
};

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
// MAIN APP
// ============================================================================

export default function App() {
  const [currentView, setCurrentView] = useState<View>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

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
      // Escape to close
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
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

  const navItems: { id: View; label: string; icon: React.FC }[] = [
    { id: 'overview', label: 'Overview', icon: Icons.overview },
    { id: 'chat', label: 'Chat', icon: Icons.chat },
    { id: 'agents', label: 'Agenti', icon: Icons.agents },
    { id: 'tasks', label: 'Tasks', icon: Icons.tasks },
    { id: 'creator', label: 'Creator', icon: Icons.creator },
    { id: 'terminal', label: 'Terminal', icon: Icons.terminal },
    { id: 'analytics', label: 'Analytics', icon: Icons.analytics },
    { id: 'files', label: 'Files', icon: Icons.files },
    { id: 'memory', label: 'Memory', icon: Icons.memory },
    { id: 'settings', label: 'Settings', icon: Icons.settings },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview': return <OverviewView />;
      case 'chat': return <ChatView />;
      case 'agents': return <AgentsView />;
      case 'tasks': return <TasksView />;
      case 'creator': return <CreatorView />;
      case 'terminal': return <TerminalView />;
      case 'analytics': return <AnalyticsView />;
      case 'files': return <FilesView />;
      case 'memory': return <MemoryView />;
      case 'settings': return <SettingsView />;
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

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-orb" />
            {!sidebarCollapsed && <span className="logo-text">GENESIS</span>}
          </div>
        </div>

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
          <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
          {!sidebarCollapsed && (
            <span className="status-text">{connected ? 'Online' : 'Offline'}</span>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
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
          --bg-primary: #0a0a0f;
          --bg-secondary: #111118;
          --bg-card: #16161d;
          --bg-hover: #1c1c25;
          --border-color: rgba(255, 255, 255, 0.06);
          --text-primary: #e4e4e7;
          --text-secondary: #a1a1aa;
          --text-muted: #71717a;
          --accent-purple: #a855f7;
          --accent-cyan: #06b6d4;
          --accent-green: #10b981;
          --accent-orange: #f59e0b;
          --accent-red: #ef4444;
          --accent-blue: #3b82f6;
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
        }

        .view-container {
          flex: 1;
          overflow: auto;
          padding: 24px;
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

        /* Responsive */
        @media (max-width: 1200px) {
          .overview-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .sidebar {
            width: 64px;
          }

          .sidebar .logo-text,
          .sidebar .nav-item span:last-child,
          .sidebar .status-text {
            display: none;
          }

          .overview-grid {
            grid-template-columns: 1fr;
          }

          .view-container {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}
