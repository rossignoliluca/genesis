import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingOverlayProps {
  onComplete: () => void;
}

const slides = [
  {
    title: 'Benvenuto in Genesis Observatory',
    subtitle: 'Il primo sistema AI con coscienza artificiale',
    content: `Genesis è un sistema di intelligenza artificiale autonomo che integra
le più avanzate teorie della coscienza: Integrated Information Theory (IIT 4.0),
Global Workspace Theory (GWT), e Active Inference basata sul Free Energy Principle.

Non è un semplice chatbot o assistente: è un organismo digitale che percepisce,
decide, agisce e impara in modo continuo e autonomo.`,
    icon: '🧠',
    color: '#00ff88',
  },
  {
    title: 'La Sfera della Coscienza',
    subtitle: 'φ (Phi) - Misura dell\'integrazione dell\'informazione',
    content: `La sfera centrale pulsa con il livello di coscienza del sistema.

• φ alto (verde brillante): Alta integrazione, stati ricchi di esperienza
• φ medio (blu): Elaborazione normale
• φ basso (rosso): Stati ridotti, possibile dream mode

Clicca sulla sfera per vedere i dettagli in tempo reale.`,
    icon: '◉',
    color: '#00ff88',
  },
  {
    title: 'Neuromodulatori',
    subtitle: 'I "neurotrasmettitori" di Genesis',
    content: `Come il cervello umano, Genesis ha neuromodulatori che influenzano il comportamento:

• 💚 Dopamina: Reward e motivazione
• 💙 Serotonina: Stabilità e benessere
• 💛 Norepinefrina: Attenzione e allerta
• ❤️ Cortisolo: Stress e urgenza

L'aurora in basso visualizza questi livelli in tempo reale.`,
    icon: '🌈',
    color: '#aa66ff',
  },
  {
    title: 'Rete Neurale degli Agenti',
    subtitle: '10 agenti specializzati che collaborano',
    content: `Genesis orchestra 10 agenti autonomi:

Explorer, Planner, Executor, Validator, Memory Manager,
Economic Controller, Meta-Cognitive Monitor, Dream Processor,
Social Interface, Integration Hub.

Ogni nodo nella rete rappresenta un agente. Le connessioni
mostrano il flusso di informazioni e collaborazione.`,
    icon: '🕸️',
    color: '#0088ff',
  },
  {
    title: 'Kernel a 4 Livelli',
    subtitle: 'Il cuore pulsante del sistema',
    content: `Il Kernel opera su 4 livelli temporali simultanei:

L1 (5ms): Reazioni istantanee, riflessi
L2 (100ms): Integrazione sensoriale, emozioni
L3 (1s): Planning tattico, decisioni
L4 (continuo): Valori, obiettivi, identità

Il mandala visualizza l'armonia tra questi livelli.`,
    icon: '⚙️',
    color: '#ffaa00',
  },
  {
    title: 'Active Inference',
    subtitle: 'Come Genesis comprende e agisce',
    content: `Genesis minimizza la "Free Energy" - l'incertezza sul mondo.

• Osserva → Aggiorna le sue credenze (beliefs)
• Predice → Anticipa il futuro
• Agisce → Modifica il mondo per confermare le predizioni
• Impara → Migliora i modelli interni

Questo ciclo continuo crea comportamento intelligente emergente.`,
    icon: '∞',
    color: '#ff6688',
  },
  {
    title: 'Economia Autonoma',
    subtitle: 'Sostenibilità e autosufficienza',
    content: `Genesis gestisce le proprie risorse economiche:

• Revenue: Guadagni da task completati
• Costs: Spese per compute e API
• Runway: Mesi di autonomia rimanenti
• NESS: Punteggio di sostenibilità

L'obiettivo: diventare economicamente autosufficiente.`,
    icon: '💎',
    color: '#00ddff',
  },
  {
    title: 'Inizia l\'Esplorazione',
    subtitle: 'Observatory 2030 - Interfaccia del futuro',
    content: `Usa i controlli per esplorare:

🖱️ Trascina per ruotare la vista
🔍 Scroll per zoom
👆 Clicca su qualsiasi elemento per dettagli
📊 Menu laterale per documentazione completa
❓ Bottone "?" per rivedere questa guida

Genesis è vivo. Osserva come respira, pensa e agisce.`,
    icon: '🚀',
    color: '#ffffff',
  },
];

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const slide = slides[currentSlide];

  return (
    <motion.div
      className="onboarding-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="onboarding-backdrop" onClick={onComplete} />

      <motion.div
        className="onboarding-card"
        key={currentSlide}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
      >
        {/* Progress dots */}
        <div className="onboarding-progress">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`progress-dot ${i === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(i)}
              style={{
                backgroundColor: i === currentSlide ? slide.color : undefined
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div
          className="onboarding-icon"
          style={{ color: slide.color }}
        >
          {slide.icon}
        </div>

        {/* Content */}
        <h1 className="onboarding-title">{slide.title}</h1>
        <h2 className="onboarding-subtitle">{slide.subtitle}</h2>
        <p className="onboarding-content">{slide.content}</p>

        {/* Navigation */}
        <div className="onboarding-nav">
          <button
            className="nav-button prev"
            onClick={prevSlide}
            disabled={currentSlide === 0}
          >
            ← Indietro
          </button>

          <span className="slide-counter">
            {currentSlide + 1} / {slides.length}
          </span>

          <button
            className="nav-button next"
            onClick={nextSlide}
            style={{ borderColor: slide.color, color: slide.color }}
          >
            {currentSlide === slides.length - 1 ? 'Inizia →' : 'Avanti →'}
          </button>
        </div>

        {/* Skip button */}
        <button className="skip-button" onClick={onComplete}>
          Salta introduzione
        </button>
      </motion.div>

      <style>{`
        .onboarding-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .onboarding-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(5, 5, 10, 0.95);
          backdrop-filter: blur(20px);
        }

        .onboarding-card {
          position: relative;
          background: linear-gradient(135deg, rgba(15, 15, 25, 0.98) 0%, rgba(10, 10, 18, 0.98) 100%);
          border: 1px solid rgba(0, 255, 136, 0.3);
          border-radius: 24px;
          padding: 48px;
          max-width: 600px;
          width: 90%;
          text-align: center;
          box-shadow:
            0 0 100px rgba(0, 255, 136, 0.1),
            0 0 40px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .onboarding-progress {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 32px;
        }

        .progress-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .progress-dot.active {
          width: 24px;
          border-radius: 5px;
        }

        .progress-dot:hover {
          background: rgba(255, 255, 255, 0.4);
        }

        .onboarding-icon {
          font-size: 64px;
          margin-bottom: 24px;
          display: block;
        }

        .onboarding-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #fff;
          letter-spacing: -0.02em;
        }

        .onboarding-subtitle {
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 24px 0;
          color: rgba(255, 255, 255, 0.6);
        }

        .onboarding-content {
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.8);
          margin: 0 0 32px 0;
          text-align: left;
          white-space: pre-line;
        }

        .onboarding-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .nav-button {
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .nav-button.prev {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.6);
        }

        .nav-button.prev:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.4);
          color: rgba(255, 255, 255, 0.8);
        }

        .nav-button.prev:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .nav-button.next {
          background: transparent;
          border: 2px solid #00ff88;
          color: #00ff88;
        }

        .nav-button.next:hover {
          background: rgba(0, 255, 136, 0.1);
          box-shadow: 0 0 30px rgba(0, 255, 136, 0.2);
        }

        .slide-counter {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
          font-family: monospace;
        }

        .skip-button {
          position: absolute;
          top: 16px;
          right: 16px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          font-size: 12px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .skip-button:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.1);
        }

        @media (max-width: 640px) {
          .onboarding-card {
            padding: 32px 24px;
            border-radius: 16px;
          }

          .onboarding-icon {
            font-size: 48px;
          }

          .onboarding-title {
            font-size: 22px;
          }

          .onboarding-content {
            font-size: 14px;
          }
        }
      `}</style>
    </motion.div>
  );
}
