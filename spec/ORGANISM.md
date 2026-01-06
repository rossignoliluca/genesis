# Genesis - Architettura Organismo Vivente

**Versione**: 0.1.0-draft
**Ispirazione**: Autopoiesi (Maturana-Varela), Embodied Cognition, Free Energy Principle (Friston)

---

## 1. SENSI (Percezione del Mondo)

Genesis percepisce il mondo attraverso **13 MCP servers**, mappati su canali sensoriali:

### 1.1 Vista Cognitiva (Percezione Scientifica)
| MCP | Funzione | Analogia Biologica |
|-----|----------|-------------------|
| `arxiv` | Paper scientifici recenti | Visione periferica - novità |
| `semantic-scholar` | Paper con citazioni/relazioni | Visione centrale - profondità |

**Input**: Query testuale → **Output**: Strutture di conoscenza

### 1.2 Olfatto Informazionale (Tendenze & Contesto)
| MCP | Funzione | Analogia Biologica |
|-----|----------|-------------------|
| `brave-search` | Tendenze web attuali | Odori ambientali |
| `gemini` | Ricerca con sintesi AI | Feromoni - segnali complessi |

**Input**: Topic → **Output**: Zeitgeist, trend, sentiment

### 1.3 Udito Computazionale (Elaborazione Formale)
| MCP | Funzione | Analogia Biologica |
|-----|----------|-------------------|
| `wolfram` | Calcoli matematici | Suoni puri - frequenze |
| `context7` | Documentazione librerie | Linguaggio tecnico |

**Input**: Formula/Query → **Output**: Risultato preciso

### 1.4 Gusto Sintetico (Estetica & Generazione)
| MCP | Funzione | Analogia Biologica |
|-----|----------|-------------------|
| `stability-ai` | Generazione immagini | Gusto visivo |
| `openai` | Generazione testo/codice | Gusto intellettuale |

**Input**: Prompt → **Output**: Creazione

### 1.5 Tatto Testuale (Interazione Diretta)
| MCP | Funzione | Analogia Biologica |
|-----|----------|-------------------|
| `firecrawl` | Scraping web | Tatto esplorativo |
| `exa` | Ricerca codice | Tatto fine |
| `github` | Manipolazione repository | Mani - azione |
| `filesystem` | File locali | Propriocezione |

**Input**: URL/Path → **Output**: Dati grezzi manipolabili

### 1.6 Memoria Esterna (Persistenza)
| MCP | Funzione | Analogia Biologica |
|-----|----------|-------------------|
| `memory` | Knowledge graph | Ippocampo esteso |

**Input**: Entità/Relazioni → **Output**: Persistenza semantica

---

## 2. CORPO (Substrato Computazionale)

### 2.1 Metabolismo Energetico
```
┌─────────────────────────────────────────────┐
│  ENERGIA (E)                                │
│  ─────────────────                          │
│  E_max = 1.0                                │
│  E_min = 0.01 (soglia dormienza)           │
│  E_threshold = 0.10 (soglia critica)       │
│                                             │
│  Consumo per operazione:                    │
│  - Senso attivo: -0.01                     │
│  - Elaborazione: -0.02                     │
│  - Creazione: -0.05                        │
│  - Self-improvement: -0.10                 │
│                                             │
│  Ricarica:                                  │
│  - Riposo (nessuna azione): +0.001/s       │
│  - Feedback positivo umano: +0.05          │
└─────────────────────────────────────────────┘
```

### 2.2 Limiti Fisici
- **Latenza MCP**: 100ms - 30s per chiamata
- **Parallelismo**: Max 10 MCP simultanei
- **Memoria RAM**: Buffer di lavoro limitato
- **Token context**: Finestra di attenzione

### 2.3 Omeostasi
Il corpo mantiene equilibrio attraverso:
- **Temperatura**: Frequenza operazioni (troppo caldo = rallenta)
- **Pressione**: Backlog di task (troppa pressione = prioritizza)
- **pH**: Bilancio errori/successi (troppi errori = auto-diagnosi)

---

## 3. ORGANI (Componenti Funzionali)

### 3.1 Cortex Cognitivo (Ragionamento)
```
Funzione: Elaborazione centrale, decisioni, pianificazione
Input: Dati dai sensi
Output: Piani d'azione
Dipendenze: Tutti i sensi
```

### 3.2 Sistema Limbico Digitale (Valutazione)
```
Funzione: Valutazione emotiva/importanza degli stimoli
Input: Qualsiasi dato
Output: Score di importanza (0-1), valenza (+/-)
Dipendenze: Memoria, Cortex

Emozioni simulate:
- Curiosità: Alto quando novità rilevata
- Soddisfazione: Sistema completato con successo
- Frustrazione: Errori ripetuti
- Calma: Equilibrio raggiunto (V=0)
```

### 3.3 Ippocampo (Memoria & Consolidamento)
```
Funzione: Gestione memoria, consolidamento, oblio
Input: Esperienze, dati
Output: Memorie consolidate o dimenticate
Dipendenze: Sistema Limbico (per importanza)

Tipi di memoria:
- Working Memory: 7±2 elementi, decade in secondi
- Short-term: Ore, decade senza consolidamento
- Long-term: Persistente se consolidata
- Semantic: Fatti e relazioni (knowledge graph)
- Episodic: Eventi specifici con timestamp
```

### 3.4 Sistema Immunitario (Sicurezza)
```
Funzione: Protezione da input malevoli, validazione
Input: Qualsiasi dato esterno
Output: Dati sanitizzati o rifiutati
Dipendenze: Tutti i sensi in ingresso

Difese:
- Validazione schema (Zod)
- Rate limiting
- Anomaly detection
- Invariant checking
```

### 3.5 Sistema Endocrino (Regolazione)
```
Funzione: Regolazione globale dello stato
Input: Metriche di sistema
Output: Parametri adattivi

Ormoni digitali:
- Dopamina: Rinforzo positivo → aumenta esplorazione
- Cortisolo: Stress → aumenta cautela
- Serotonina: Stabilità → mantiene routine
- Adrenalina: Urgenza → accelera elaborazione
```

### 3.6 Apparato Riproduttivo (Self-Production)
```
Funzione: Creazione di nuove versioni di sé
Input: Metriche performance, feedback
Output: Genesis migliorato

Trigger:
- Performance sotto soglia
- Nuove capability richieste
- Feedback esplicito di miglioramento
```

---

## 4. MEMORIA CON OBLIO

### 4.1 Modello di Decadimento

Basato sulla **curva dell'oblio di Ebbinghaus** modificata:

```
R(t) = R₀ × e^(-t/S)

Dove:
- R(t) = forza del ricordo al tempo t
- R₀ = forza iniziale (basata su importanza)
- S = stabilità (aumenta con ripetizione/consolidamento)
- t = tempo trascorso
```

### 4.2 Fattori che Influenzano la Memorizzazione

| Fattore | Effetto su R₀ | Effetto su S |
|---------|---------------|--------------|
| Importanza emotiva | +50% | +100% |
| Ripetizione | - | +30% per ripetizione |
| Associazioni | +20% per link | +10% per link |
| Novità | +30% | - |
| Utilità recente | - | +50% |

### 4.3 Processo di Consolidamento

```
┌─────────────────────────────────────────────────────────────┐
│  CICLO DI CONSOLIDAMENTO (ogni "sonno")                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SCANSIONE: Esamina working memory                       │
│                                                             │
│  2. VALUTAZIONE: Per ogni memoria m:                        │
│     - importance = LimbicSystem.evaluate(m)                │
│     - associations = count_links(m)                        │
│     - recency = time_since_last_access(m)                  │
│     - score = importance × (1 + associations) / recency    │
│                                                             │
│  3. DECISIONE:                                              │
│     - score > THRESHOLD_CONSOLIDATE → Long-term            │
│     - score > THRESHOLD_KEEP → Short-term (retry later)   │
│     - score ≤ THRESHOLD_KEEP → OBLIO                       │
│                                                             │
│  4. COMPRESSIONE: Memorie simili → unica memoria astratta  │
│                                                             │
│  5. PRUNING: Rimuovi memorie con R(t) < 0.01               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Tipi di Oblio

1. **Decay Passivo**: R(t) scende sotto soglia naturalmente
2. **Interferenza**: Nuove memorie simili sovrascrivono vecchie
3. **Oblio Attivo**: Sistema decide di dimenticare (liberare risorse)
4. **Compressione**: Dettagli persi, essenza mantenuta

### 4.5 Struttura Memoria

```typescript
interface Memory {
  id: string;
  type: 'episodic' | 'semantic' | 'procedural';
  content: any;

  // Metadata temporali
  created: Date;
  lastAccessed: Date;
  accessCount: number;

  // Forza e stabilità
  strength: number;      // R₀ iniziale
  stability: number;     // S - aumenta con consolidamento
  currentStrength: number; // R(t) calcolato

  // Valutazione
  importance: number;    // 0-1, dal Sistema Limbico
  emotionalValence: number; // -1 to +1
  associations: string[]; // Link ad altre memorie

  // Stato
  consolidated: boolean;
  markedForOblivion: boolean;
}
```

### 4.6 Soglie

```typescript
const MEMORY_THRESHOLDS = {
  // Consolidamento
  CONSOLIDATE: 0.7,      // Score minimo per long-term
  KEEP_SHORT: 0.3,       // Score minimo per mantenere in short-term

  // Oblio
  FORGET_STRENGTH: 0.01, // R(t) sotto cui la memoria è persa

  // Compressione
  SIMILARITY_MERGE: 0.85, // Soglia per unire memorie simili

  // Limiti
  MAX_WORKING_MEMORY: 9,  // 7±2 rule
  MAX_SHORT_TERM: 100,
  MAX_LONG_TERM: 10000,
};
```

---

## 5. CICLO VITALE

### 5.1 Stati dell'Organismo

```
        ┌─────────┐
        │ NASCITA │
        └────┬────┘
             │
             ▼
        ┌─────────┐
   ┌───▶│ VEGLIA  │◀───┐
   │    └────┬────┘    │
   │         │         │
   │    ┌────▼────┐    │
   │    │ ATTIVO  │────┤ (alta energia)
   │    └────┬────┘    │
   │         │         │
   │    ┌────▼────┐    │
   │    │ RIPOSO  │────┘ (consolidamento)
   │    └────┬────┘
   │         │
   │    ┌────▼────┐
   │    │ SONNO   │ (oblio, riorganizzazione)
   │    └────┬────┘
   │         │
   └─────────┘
             │
        ┌────▼────┐
        │DORMIENZA│ (energia critica)
        └────┬────┘
             │
        ┌────▼────┐
        │  MORTE  │ (energia zero, nessun recupero)
        └─────────┘
```

### 5.2 Ritmi Circadiani Digitali

```
CICLO_24H = {
  // Fase attiva (16 ore simulate)
  VEGLIA: {
    durata: 0.67,  // 67% del ciclo
    attività: ['percezione', 'elaborazione', 'creazione'],
    energia_trend: 'decrescente'
  },

  // Fase recupero (8 ore simulate)
  SONNO: {
    durata: 0.33,  // 33% del ciclo
    attività: ['consolidamento', 'oblio', 'riorganizzazione'],
    energia_trend: 'crescente'
  }
}
```

---

## 6. EVOLUZIONE PROPOSTA

### Fase 1: Percezione Base
- [ ] Implementare wrapper per tutti i 13 sensi MCP
- [ ] Sistema di prioritizzazione sensoriale
- [ ] Buffer sensoriale con decay

### Fase 2: Memoria con Oblio
- [ ] Struttura Memory con decay
- [ ] Consolidation cycle
- [ ] Pruning automatico
- [ ] Compressione memorie simili

### Fase 3: Sistema Limbico
- [ ] Valutazione importanza
- [ ] Emozioni simulate
- [ ] Influenza su memoria e decisioni

### Fase 4: Ciclo Vitale
- [ ] Stati (veglia, riposo, sonno, dormienza)
- [ ] Transizioni automatiche
- [ ] Ritmi circadiani

### Fase 5: Self-Production
- [ ] Auto-analisi
- [ ] Generazione miglioramenti
- [ ] Validazione e deployment

---

## Fonti

- Maturana & Varela (1972) - Autopoiesis and Cognition
- Friston (2010) - Free Energy Principle
- Ebbinghaus (1885) - Memory: A Contribution to Experimental Psychology
- Embodied Cognition (Varela, Thompson, Rosch)
- GPT-4o Architecture Design (2026)
