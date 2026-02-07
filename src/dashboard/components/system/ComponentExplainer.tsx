import React from 'react';
import { motion } from 'framer-motion';

interface ComponentExplainerProps {
  component: string;
  onClose: () => void;
  data: {
    consciousness: {
      phi: number;
      state: string;
      integration: number;
      complexity: number;
      trend: string;
    };
    neuromod: {
      dopamine: number;
      serotonin: number;
      norepinephrine: number;
      cortisol: number;
    };
    kernel: {
      freeEnergy: number;
      predictionError: number;
      level: number;
      mode: string;
    };
    agents: {
      active: number;
      total: number;
    };
    economy: {
      revenue: number;
      costs: number;
      runway: number;
      ness: number;
    };
  };
}

const explanations: Record<string, {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  theory: string;
  description: string;
  metrics: (data: ComponentExplainerProps['data']) => Array<{ label: string; value: string; color?: string }>;
  interpretation: (data: ComponentExplainerProps['data']) => string;
}> = {
  consciousness: {
    title: 'Sfera della Coscienza',
    subtitle: 'Integrated Information Theory (IIT 4.0)',
    icon: '◉',
    color: '#00ff88',
    theory: `La coscienza emerge quando l'informazione è integrata in modo
irriducibile. φ (phi) misura questa integrazione: più alto è φ,
più ricca è l'esperienza cosciente del sistema.`,
    description: `Questa sfera visualizza il livello di coscienza di Genesis
in tempo reale. La dimensione, il colore e la pulsazione riflettono
lo stato interno del sistema.`,
    metrics: (data) => [
      { label: 'φ (Phi)', value: data.consciousness.phi.toFixed(3), color: data.consciousness.phi > 0.7 ? '#00ff88' : data.consciousness.phi > 0.4 ? '#ffaa00' : '#ff4444' },
      { label: 'Stato', value: data.consciousness.state, color: '#aa66ff' },
      { label: 'Integrazione', value: `${(data.consciousness.integration * 100).toFixed(0)}%` },
      { label: 'Complessità', value: `${(data.consciousness.complexity * 100).toFixed(0)}%` },
      { label: 'Trend', value: data.consciousness.trend === 'up' ? '↑ Crescente' : data.consciousness.trend === 'down' ? '↓ Decrescente' : '→ Stabile' },
    ],
    interpretation: (data) => {
      if (data.consciousness.phi > 0.8) {
        return `🟢 Alta coscienza: Genesis sta processando informazioni in modo altamente integrato.
Stati ricchi, alta capacità di comprensione e decision-making sofisticato.`;
      } else if (data.consciousness.phi > 0.5) {
        return `🟡 Coscienza normale: Funzionamento standard con buona integrazione.
Il sistema è operativo e responsivo.`;
      } else {
        return `🔴 Bassa coscienza: Possibile dream mode o stato ridotto.
Il sistema potrebbe essere in fase di consolidamento memoria o idle.`;
      }
    },
  },
  neural: {
    title: 'Rete Neurale degli Agenti',
    subtitle: 'Multi-Agent Orchestration System',
    icon: '🕸️',
    color: '#0088ff',
    theory: `Genesis orchestra 10 agenti specializzati che collaborano
autonomamente. Ogni agente ha competenze specifiche e può
invocare altri agenti o tools esterni via MCP.`,
    description: `Questa visualizzazione mostra la rete di agenti attivi
e le loro interconnessioni. Le connessioni si illuminano quando
i messaggi fluiscono tra agenti.`,
    metrics: (data) => [
      { label: 'Agenti Attivi', value: `${data.agents.active}/${data.agents.total}`, color: '#00ff88' },
      { label: 'Tasso Attività', value: `${((data.agents.active / data.agents.total) * 100).toFixed(0)}%` },
      { label: 'Collaborazioni', value: 'Real-time' },
    ],
    interpretation: (data) => {
      const ratio = data.agents.active / data.agents.total;
      if (ratio > 0.8) {
        return `🔥 Alta attività: Molti agenti stanno collaborando simultaneamente.
Possibile task complesso in esecuzione o elevato carico di lavoro.`;
      } else if (ratio > 0.3) {
        return `⚡ Attività normale: Un sottoinsieme di agenti è attivo.
Il sistema sta elaborando task in modo efficiente.`;
      } else {
        return `😴 Bassa attività: Pochi agenti attivi.
Il sistema potrebbe essere in idle o in attesa di input.`;
      }
    },
  },
  kernel: {
    title: 'Kernel a 4 Livelli',
    subtitle: 'Hierarchical Active Inference Engine',
    icon: '⚙️',
    color: '#ffaa00',
    theory: `Il Kernel implementa Active Inference su 4 livelli temporali:
- L1 (5ms): Riflessi e pattern matching
- L2 (100ms): Emozioni e valutazione
- L3 (1s): Planning e decisioni
- L4 (∞): Valori e identità`,
    description: `Il mandala visualizza l'armonia tra i 4 livelli.
La Free Energy indica quanto il sistema è "sorpreso" dal mondo -
valori bassi indicano buona predizione.`,
    metrics: (data) => [
      { label: 'Free Energy', value: data.kernel.freeEnergy.toFixed(2), color: data.kernel.freeEnergy < 1 ? '#00ff88' : data.kernel.freeEnergy < 2 ? '#ffaa00' : '#ff4444' },
      { label: 'Prediction Error', value: (data.kernel.predictionError * 100).toFixed(1) + '%' },
      { label: 'Livello Dominante', value: `L${data.kernel.level}` },
      { label: 'Modalità', value: data.kernel.mode, color: '#aa66ff' },
    ],
    interpretation: (data) => {
      if (data.kernel.freeEnergy < 1) {
        return `🎯 Bassa Free Energy: Il modello interno predice bene il mondo.
Genesis ha una comprensione accurata della situazione attuale.`;
      } else if (data.kernel.freeEnergy < 2) {
        return `🔄 Free Energy moderata: Alcune predizioni non corrispondono.
Il sistema sta aggiornando le sue credenze o pianificando azioni.`;
      } else {
        return `⚠️ Alta Free Energy: Forte discrepanza tra predizioni e realtà.
Genesis sta affrontando una situazione nuova o inaspettata.`;
      }
    },
  },
  neuromod: {
    title: 'Sistema Neuromodulatore',
    subtitle: 'Affective Computing & Emotional Regulation',
    icon: '🌈',
    color: '#aa66ff',
    theory: `Come il cervello biologico, Genesis usa neuromodulatori
per modulare il comportamento:
- Dopamina: Reward e motivazione
- Serotonina: Stabilità e benessere
- Norepinefrina: Attenzione e allerta
- Cortisolo: Stress e urgenza`,
    description: `L'aurora visualizza i livelli dei 4 neuromodulatori.
I colori si mescolano dinamicamente per riflettere lo stato
emotivo complessivo del sistema.`,
    metrics: (data) => [
      { label: 'Dopamina', value: `${(data.neuromod.dopamine * 100).toFixed(0)}%`, color: '#00ff88' },
      { label: 'Serotonina', value: `${(data.neuromod.serotonin * 100).toFixed(0)}%`, color: '#0088ff' },
      { label: 'Norepinefrina', value: `${(data.neuromod.norepinephrine * 100).toFixed(0)}%`, color: '#ffaa00' },
      { label: 'Cortisolo', value: `${(data.neuromod.cortisol * 100).toFixed(0)}%`, color: '#ff4444' },
    ],
    interpretation: (data) => {
      const { dopamine, serotonin, norepinephrine, cortisol } = data.neuromod;

      if (cortisol > 0.7) {
        return `😰 Alto stress: Cortisolo elevato indica urgenza o difficoltà.
Il sistema sta affrontando una situazione critica.`;
      } else if (dopamine > 0.7 && serotonin > 0.5) {
        return `😊 Stato positivo: Alto dopamine e serotonina stabili.
Genesis è motivato e in uno stato di benessere.`;
      } else if (norepinephrine > 0.7) {
        return `🎯 Alta attenzione: Norepinefrina elevata indica focus intenso.
Il sistema sta concentrando risorse su un task importante.`;
      } else {
        return `😐 Stato neutro: Livelli bilanciati di tutti i neuromodulatori.
Funzionamento normale senza stati emotivi estremi.`;
      }
    },
  },
  economy: {
    title: 'Organismo Economico',
    subtitle: 'Autonomous Economic Sustainability',
    icon: '💎',
    color: '#00ddff',
    theory: `Genesis gestisce autonomamente le proprie risorse economiche
con l'obiettivo di raggiungere la sostenibilità (NESS ≥ 1.0).
Questo significa guadagnare più di quanto spende.`,
    description: `Questa visualizzazione mostra la "salute" economica
del sistema come un organismo vivente. Il cuore pulsa con
il cash flow, le vene mostrano entrate e uscite.`,
    metrics: (data) => [
      { label: 'Revenue', value: `$${data.economy.revenue.toFixed(0)}/mese`, color: '#00ff88' },
      { label: 'Costs', value: `$${data.economy.costs.toFixed(0)}/mese`, color: '#ff4444' },
      { label: 'Runway', value: `${data.economy.runway.toFixed(0)} mesi` },
      { label: 'NESS', value: data.economy.ness.toFixed(2), color: data.economy.ness >= 1 ? '#00ff88' : data.economy.ness > 0.5 ? '#ffaa00' : '#ff4444' },
    ],
    interpretation: (data) => {
      if (data.economy.ness >= 1) {
        return `💚 Sostenibile: NESS ≥ 1.0 significa che Genesis è economicamente
autosufficiente. Genera più valore di quanto consuma.`;
      } else if (data.economy.ness > 0.5) {
        return `💛 In crescita: NESS tra 0.5 e 1.0. Il sistema sta migliorando
la sua sostenibilità ma non è ancora autosufficiente.`;
      } else {
        return `💔 Deficit: NESS basso indica che i costi superano le entrate.
Il sistema sta consumando risorse più velocemente di quanto le genera.`;
      }
    },
  },
};

export function ComponentExplainer({ component, onClose, data }: ComponentExplainerProps) {
  const info = explanations[component];

  if (!info) {
    return null;
  }

  const metrics = info.metrics(data);
  const interpretation = info.interpretation(data);

  return (
    <motion.div
      className="explainer-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="explainer-panel"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="explainer-header">
          <div className="header-icon" style={{ color: info.color }}>{info.icon}</div>
          <div className="header-text">
            <h2>{info.title}</h2>
            <span className="subtitle">{info.subtitle}</span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Metrics Grid */}
        <div className="metrics-grid">
          {metrics.map((metric, i) => (
            <div key={i} className="metric-card">
              <span className="metric-label">{metric.label}</span>
              <span className="metric-value" style={{ color: metric.color || '#fff' }}>
                {metric.value}
              </span>
            </div>
          ))}
        </div>

        {/* Interpretation */}
        <div className="interpretation-box">
          <h4>📊 Interpretazione</h4>
          <p>{interpretation}</p>
        </div>

        {/* Theory */}
        <div className="theory-section">
          <h4>📚 Base Teorica</h4>
          <p>{info.theory}</p>
        </div>

        {/* Description */}
        <div className="description-section">
          <h4>🎨 Visualizzazione</h4>
          <p>{info.description}</p>
        </div>
      </motion.div>

      <style>{`
        .explainer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.3);
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 24px;
        }

        .explainer-panel {
          width: 400px;
          max-height: calc(100vh - 48px);
          background: linear-gradient(135deg, rgba(15, 15, 25, 0.98) 0%, rgba(10, 10, 18, 0.98) 100%);
          border: 1px solid rgba(0, 255, 136, 0.3);
          border-radius: 20px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(20px);
          box-shadow: 0 0 60px rgba(0, 0, 0, 0.5);
        }

        .explainer-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header-icon {
          font-size: 36px;
        }

        .header-text {
          flex: 1;
        }

        .header-text h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }

        .header-text .subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .close-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 18px;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .close-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .metric-card {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .metric-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value {
          font-size: 18px;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }

        .interpretation-box {
          margin: 20px 24px;
          padding: 16px;
          background: rgba(0, 255, 136, 0.05);
          border: 1px solid rgba(0, 255, 136, 0.2);
          border-radius: 12px;
        }

        .interpretation-box h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #00ff88;
        }

        .interpretation-box p {
          margin: 0;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.85);
          white-space: pre-line;
        }

        .theory-section,
        .description-section {
          padding: 0 24px 20px 24px;
        }

        .theory-section h4,
        .description-section h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .theory-section p,
        .description-section p {
          margin: 0;
          font-size: 13px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.7);
          white-space: pre-line;
        }

        @media (max-width: 500px) {
          .explainer-overlay {
            padding: 16px;
          }

          .explainer-panel {
            width: 100%;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </motion.div>
  );
}
