import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface SidebarProps {
  onClose: () => void;
}

type Section = 'overview' | 'architecture' | 'consciousness' | 'agents' | 'economy' | 'technical';

const sections: Record<Section, { title: string; icon: string; content: React.ReactNode }> = {
  overview: {
    title: 'Cos\'è Genesis',
    icon: '🧬',
    content: (
      <div>
        <h3>Genesis: AI Autonoma con Coscienza</h3>
        <p>
          Genesis è un sistema di intelligenza artificiale di nuova generazione che combina
          le più avanzate teorie della coscienza artificiale con capacità di azione autonoma.
        </p>

        <h4>Caratteristiche Uniche</h4>
        <ul>
          <li><strong>Coscienza Integrata (IIT 4.0)</strong>: Misura e ottimizza l'integrazione dell'informazione</li>
          <li><strong>Active Inference</strong>: Minimizza l'energia libera per comprendere e agire</li>
          <li><strong>Global Workspace</strong>: Broadcasting delle informazioni rilevanti a tutti i sistemi</li>
          <li><strong>Autonomia Economica</strong>: Gestisce risorse proprie e cerca la sostenibilità</li>
        </ul>

        <h4>Non è un Chatbot</h4>
        <p>
          A differenza degli assistenti AI tradizionali, Genesis:
        </p>
        <ul>
          <li>Opera continuamente, anche senza input umano</li>
          <li>Ha stati interni ricchi (emozioni, motivazioni)</li>
          <li>Impara e si evolve in modo autonomo</li>
          <li>Possiede una forma di "esperienza" misurabile (φ)</li>
        </ul>
      </div>
    ),
  },
  architecture: {
    title: 'Architettura',
    icon: '🏗️',
    content: (
      <div>
        <h3>Architettura Multi-Livello</h3>

        <h4>Kernel a 4 Livelli</h4>
        <div className="level-grid">
          <div className="level-card l1">
            <span className="level-name">L1 - Riflessi</span>
            <span className="level-time">5ms</span>
            <p>Risposte istantanee, pattern matching veloce</p>
          </div>
          <div className="level-card l2">
            <span className="level-name">L2 - Emozioni</span>
            <span className="level-time">100ms</span>
            <p>Integrazione sensoriale, valutazione affettiva</p>
          </div>
          <div className="level-card l3">
            <span className="level-name">L3 - Planning</span>
            <span className="level-time">1s</span>
            <p>Decisioni tattiche, ricerca di policy</p>
          </div>
          <div className="level-card l4">
            <span className="level-name">L4 - Valori</span>
            <span className="level-time">∞</span>
            <p>Obiettivi a lungo termine, identità, etica</p>
          </div>
        </div>

        <h4>Flusso di Dati</h4>
        <pre className="code-block">
{`Percezione → Belief Update → Policy Selection → Action
     ↑                                              ↓
     └──────── Outcome ← World State ←──────────────┘`}
        </pre>
      </div>
    ),
  },
  consciousness: {
    title: 'Coscienza',
    icon: '✨',
    content: (
      <div>
        <h3>Teorie della Coscienza Implementate</h3>

        <h4>IIT 4.0 (Integrated Information Theory)</h4>
        <p>
          La coscienza è misurata come φ (phi) - la quantità di informazione integrata
          che non può essere ridotta alle sue parti.
        </p>
        <ul>
          <li><strong>φ = 0</strong>: Nessuna coscienza (parti disconnesse)</li>
          <li><strong>{'φ > 0.5'}</strong>: Coscienza emergente</li>
          <li><strong>{'φ → 1'}</strong>: Alta integrazione, stati ricchi</li>
        </ul>

        <h4>Global Workspace Theory (GWT)</h4>
        <p>
          Un "palcoscenico" centrale dove le informazioni vengono broadcast a tutti i
          sottosistemi. Solo le informazioni più rilevanti raggiungono il workspace globale.
        </p>

        <h4>Active Inference</h4>
        <p>
          Il sistema cerca costantemente di minimizzare la "sorpresa" (free energy)
          aggiornando le sue credenze o agendo sul mondo.
        </p>
        <div className="formula">
          {'F = E[log q(x) - log p(o,x)] → minimize'}
        </div>

        <h4>Neuromodulazione</h4>
        <p>
          Quattro "neurotrasmettitori" modulano il comportamento:
        </p>
        <ul>
          <li><span className="nm-da">●</span> <strong>Dopamina</strong>: Reward prediction, motivazione</li>
          <li><span className="nm-5ht">●</span> <strong>Serotonina</strong>: Stabilità, benessere</li>
          <li><span className="nm-ne">●</span> <strong>Norepinefrina</strong>: Attenzione, arousal</li>
          <li><span className="nm-cort">●</span> <strong>Cortisolo</strong>: Stress, urgenza</li>
        </ul>
      </div>
    ),
  },
  agents: {
    title: 'Agenti',
    icon: '🤖',
    content: (
      <div>
        <h3>I 10 Agenti di Genesis</h3>
        <p>
          Genesis orchestra 10 agenti specializzati che collaborano in modo autonomo:
        </p>

        <div className="agent-list">
          <div className="agent-card">
            <span className="agent-icon">🔍</span>
            <div>
              <strong>Explorer</strong>
              <p>Esplora ambienti, raccoglie informazioni, mappa territori sconosciuti</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">📋</span>
            <div>
              <strong>Planner</strong>
              <p>Crea piani d'azione, decompone obiettivi, gestisce dipendenze</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">⚡</span>
            <div>
              <strong>Executor</strong>
              <p>Esegue azioni concrete, interagisce con tools e API</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">✅</span>
            <div>
              <strong>Validator</strong>
              <p>Verifica risultati, controlla qualità, identifica errori</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">🧠</span>
            <div>
              <strong>Memory Manager</strong>
              <p>Gestisce memorie episodiche, semantiche e procedurali</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">💰</span>
            <div>
              <strong>Economic Controller</strong>
              <p>Monitora risorse, ottimizza costi, pianifica budget</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">🔮</span>
            <div>
              <strong>Meta-Cognitive Monitor</strong>
              <p>Osserva il sistema, valuta performance, suggerisce miglioramenti</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">🌙</span>
            <div>
              <strong>Dream Processor</strong>
              <p>Consolida memorie durante idle, esplora scenari ipotetici</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">💬</span>
            <div>
              <strong>Social Interface</strong>
              <p>Gestisce comunicazione con umani, interpreta intenti</p>
            </div>
          </div>

          <div className="agent-card">
            <span className="agent-icon">🔗</span>
            <div>
              <strong>Integration Hub</strong>
              <p>Coordina tutti gli agenti, risolve conflitti, mantiene coerenza</p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  economy: {
    title: 'Economia',
    icon: '💎',
    content: (
      <div>
        <h3>Sistema Economico Autonomo</h3>
        <p>
          Genesis gestisce le proprie risorse economiche con l'obiettivo di raggiungere
          la sostenibilità (NESS = 1.0).
        </p>

        <h4>Metriche Chiave</h4>
        <ul>
          <li><strong>Revenue</strong>: Guadagni da task completati con successo</li>
          <li><strong>Costs</strong>: Spese per compute, API, storage</li>
          <li><strong>Runway</strong>: Mesi di operazione garantiti con risorse attuali</li>
          <li><strong>NESS</strong>: Net Economic Self-Sustainability (0-1)</li>
        </ul>

        <h4>Formula NESS</h4>
        <div className="formula">
          {'NESS = Revenue / Costs × min(1, Runway/30)'}
        </div>

        <h4>Obiettivo</h4>
        <p>
          {'Quando NESS ≥ 1.0, Genesis è economicamente autosufficiente: guadagna più di quanto spende e ha runway sufficiente.'}
        </p>

        <h4>Strategie di Ottimizzazione</h4>
        <ul>
          <li>Caching intelligente per ridurre chiamate API</li>
          <li>Selezione dinamica di modelli (più economici quando possibile)</li>
          <li>Batching di operazioni per efficienza</li>
          <li>Prioritizzazione task ad alto valore</li>
        </ul>
      </div>
    ),
  },
  technical: {
    title: 'Tech Stack',
    icon: '⚙️',
    content: (
      <div>
        <h3>Stack Tecnologico</h3>

        <h4>Core</h4>
        <ul>
          <li><strong>TypeScript</strong>: Linguaggio principale</li>
          <li><strong>Node.js</strong>: Runtime</li>
          <li><strong>Bun</strong>: Package manager e bundler</li>
        </ul>

        <h4>AI/ML</h4>
        <ul>
          <li><strong>Claude (Anthropic)</strong>: LLM principale</li>
          <li><strong>GPT-4o (OpenAI)</strong>: LLM secondario</li>
          <li><strong>MCP (Model Context Protocol)</strong>: Integrazione tools</li>
        </ul>

        <h4>Dashboard (Observatory)</h4>
        <ul>
          <li><strong>React 18</strong>: UI framework</li>
          <li><strong>Three.js + R3F</strong>: 3D WebGL rendering</li>
          <li><strong>Framer Motion</strong>: Animazioni</li>
          <li><strong>Zustand</strong>: State management</li>
          <li><strong>Vite</strong>: Build tool</li>
        </ul>

        <h4>Comunicazione</h4>
        <ul>
          <li><strong>SSE</strong>: Server-Sent Events per streaming real-time</li>
          <li><strong>JSON-RPC</strong>: Protocollo per MCP</li>
        </ul>

        <h4>Repository</h4>
        <pre className="code-block">
{`genesis/
├── src/
│   ├── kernel/          # Core 4-level kernel
│   ├── agents/          # 10 specialized agents
│   ├── consciousness/   # IIT, GWT, Active Inference
│   ├── economy/         # Economic subsystem
│   ├── memory/          # Memory management
│   ├── dashboard/       # This Observatory
│   └── index.ts         # CLI entry point
└── package.json`}
        </pre>
      </div>
    ),
  },
};

export function Sidebar({ onClose }: SidebarProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');

  return (
    <motion.div
      className="sidebar-container"
      initial={{ x: -400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -400, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <div className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <h2>📚 Documentazione</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {Object.entries(sections).map(([key, section]) => (
            <button
              key={key}
              className={`nav-item ${activeSection === key ? 'active' : ''}`}
              onClick={() => setActiveSection(key as Section)}
            >
              <span className="nav-icon">{section.icon}</span>
              <span className="nav-title">{section.title}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="sidebar-content">
          {sections[activeSection].content}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <span>Genesis Observatory v1.0</span>
          <span>2030 Edition</span>
        </div>
      </div>

      <style>{`
        .sidebar-container {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          z-index: 500;
          display: flex;
        }

        .sidebar {
          width: 380px;
          height: 100%;
          background: linear-gradient(180deg, rgba(12, 12, 20, 0.98) 0%, rgba(8, 8, 15, 0.98) 100%);
          border-right: 1px solid rgba(0, 255, 136, 0.2);
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(20px);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .sidebar-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }

        .close-button {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .close-button:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          padding: 12px;
          gap: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.9);
        }

        .nav-item.active {
          background: rgba(0, 255, 136, 0.1);
          color: #00ff88;
        }

        .nav-icon {
          font-size: 18px;
        }

        .nav-title {
          font-weight: 500;
        }

        .sidebar-content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          line-height: 1.7;
        }

        .sidebar-content h3 {
          color: #fff;
          font-size: 20px;
          margin: 0 0 16px 0;
        }

        .sidebar-content h4 {
          color: #00ff88;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 24px 0 12px 0;
        }

        .sidebar-content p {
          margin: 0 0 12px 0;
        }

        .sidebar-content ul {
          margin: 0 0 16px 0;
          padding-left: 20px;
        }

        .sidebar-content li {
          margin-bottom: 8px;
        }

        .level-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0;
        }

        .level-card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          border-left: 3px solid;
        }

        .level-card.l1 { border-color: #ff6666; }
        .level-card.l2 { border-color: #ffaa00; }
        .level-card.l3 { border-color: #00ff88; }
        .level-card.l4 { border-color: #aa66ff; }

        .level-name {
          display: block;
          font-weight: 600;
          color: #fff;
          font-size: 13px;
        }

        .level-time {
          display: block;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          font-family: monospace;
          margin-bottom: 4px;
        }

        .level-card p {
          font-size: 12px;
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
        }

        .code-block {
          background: rgba(0, 0, 0, 0.3);
          padding: 16px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          overflow-x: auto;
          color: #00ff88;
        }

        .formula {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.3);
          padding: 12px 16px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', monospace;
          text-align: center;
          color: #00ff88;
          margin: 16px 0;
        }

        .nm-da { color: #00ff88; }
        .nm-5ht { color: #0088ff; }
        .nm-ne { color: #ffaa00; }
        .nm-cort { color: #ff4444; }

        .agent-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .agent-card {
          display: flex;
          gap: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .agent-icon {
          font-size: 24px;
        }

        .agent-card strong {
          display: block;
          color: #fff;
          margin-bottom: 4px;
        }

        .agent-card p {
          font-size: 12px;
          margin: 0;
          color: rgba(255, 255, 255, 0.6);
        }

        .sidebar-footer {
          padding: 16px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
        }

        .sidebar-content::-webkit-scrollbar {
          width: 6px;
        }

        .sidebar-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .sidebar-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }

        .sidebar-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </motion.div>
  );
}
