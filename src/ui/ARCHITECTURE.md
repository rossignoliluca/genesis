# Genesis Observatory UI - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Genesis System                               │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   FEK    │  │   Brain  │  │  Memory  │  │ Economy  │        │
│  │  Kernel  │  │  Agents  │  │  System  │  │  Engine  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│        │              │             │             │              │
│        └──────────────┴─────────────┴─────────────┘              │
│                         │                                         │
│                  ┌──────▼──────┐                                 │
│                  │  Dashboard  │  (:9876)                        │
│                  │   Server    │                                 │
│                  └─────────────┘                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP/SSE
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  Genesis Observatory UI                          │
│                                                                   │
│  ┌───────────────────────────────────────────────────┐          │
│  │              SSEClient                             │          │
│  │  • Connects to /api/metrics (polling)             │          │
│  │  • Connects to /api/events (SSE stream)           │          │
│  │  • Auto-reconnect on disconnect                   │          │
│  │  • Manages subscriptions                          │          │
│  └──────────────────┬────────────────────────────────┘          │
│                     │                                             │
│                     │ SystemMetrics                              │
│                     │                                             │
│  ┌──────────────────▼────────────────────────────────┐          │
│  │            StateMapper                             │          │
│  │  • Maps SystemMetrics → UIState                   │          │
│  │  • Computes derived metrics                       │          │
│  │  • Categorizes events                             │          │
│  │  • Tracks trends                                  │          │
│  └──────┬─────────┬─────────┬─────────┬──────────────┘          │
│         │         │         │         │                          │
│         │         │         │         │                          │
│  ┌──────▼──┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───────┐                │
│  │ PhiOrb  │ │Neuro- │ │Economy│ │  Agent    │                │
│  │         │ │mod    │ │ Card  │ │  Network  │                │
│  │  • φ    │ │• DA   │ │• $$$  │ │  • Graph  │                │
│  │  • ∫    │ │• 5HT  │ │• ROI  │ │  • Nodes  │                │
│  │  • viz  │ │• NE   │ │• NESS │ │  • Edges  │                │
│  │  • path │ │• Cort │ │• Chart│ │  • Layout │                │
│  └─────────┘ └───────┘ └───────┘ └───────────┘                │
│         │         │         │         │                          │
│         └─────────┴─────────┴─────────┘                          │
│                     │                                             │
│  ┌──────────────────▼────────────────────────────────┐          │
│  │            Observatory                             │          │
│  │  • Main orchestrator                              │          │
│  │  • Unified state management                       │          │
│  │  • Component coordination                         │          │
│  │  • Event distribution                             │          │
│  └──────────────────┬────────────────────────────────┘          │
│                     │                                             │
└─────────────────────┼─────────────────────────────────────────┘
                      │
                      │ UIState
                      │
┌─────────────────────▼─────────────────────────────────────────┐
│                Your Application                                 │
│                                                                  │
│  React │ Vue │ Svelte │ Angular │ Vanilla JS                   │
│                                                                  │
│  • Subscribe to state updates                                   │
│  • Render visualizations                                        │
│  • Handle user interactions                                     │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Metrics Collection

```
Genesis System
    ↓
CentralAwareness.getState()
    ↓
DashboardServer.getMetrics()
    ↓
{
  timestamp,
  uptime,
  consciousness: { phi, state, integration },
  kernel: { mode, energy, cycles },
  agents: { total, active, queued },
  memory_system: { episodic, semantic, procedural },
  llm: { totalRequests, totalCost, avgLatency },
  mcp: { connectedServers, availableTools }
}
```

### 2. Transport Layer

```
HTTP GET /api/metrics
    ↓
SSEClient.fetchMetrics()
    ↓
Poll every 1000ms

SSE /api/events
    ↓
SSEClient.eventSource.onmessage
    ↓
Real-time events
```

### 3. State Transformation

```
SystemMetrics
    ↓
StateMapper.mapToUIState()
    ↓
{
  timestamp,
  connected,
  loading,
  error,
  metrics: SystemMetrics,
  events: UIEvent[],
  computed: {
    phiQuality: 'excellent' | 'good' | 'degraded' | 'critical',
    neuromodTone: 'calm' | 'focused' | 'stressed' | 'excited' | 'threat',
    economicHealth: 'sustainable' | 'warning' | 'critical',
    systemHealth: 'nominal' | 'degraded' | 'critical',
    attentionPriority: string | null
  }
}
```

### 4. Component Updates

```
UIState
    ↓
Observatory.handleMetricsUpdate()
    ↓
┌─────────────────────────────────┐
│ PhiOrb.update(metrics)          │
│ Neuromod.update(metrics)        │
│ Economy.update(metrics)         │
│ Agents.update(metrics)          │
└─────────────────────────────────┘
    ↓
Component-specific data structures
    ↓
Subscribers notified
```

## Component Architecture

### PhiOrb Component

```typescript
class PhiOrb {
  private data: PhiOrbData
  private subscribers: Set<Subscriber>

  update(metrics: SystemMetrics) {
    this.data = {
      phi: metrics.consciousness.phi,
      state: metrics.consciousness.state,
      integration: metrics.consciousness.integration,
      trend: computeTrend(phi),
      quality: computeQuality(phi),
      color: getColor(phi),
      pulseRate: getPulseRate(phi)
    }
    notifySubscribers()
  }

  getVisualization() {
    return {
      radius: 50 + phi * 50,
      opacity: 0.6 + phi * 0.4,
      glowIntensity: phi * 2.0,
      rotation: Date.now() / pulseRate,
      particleCount: floor(phi * 100)
    }
  }
}
```

**Data Flow:**
```
SystemMetrics → PhiOrb.update() → PhiOrbData → Subscribers
                                              ↓
                                    getVisualization()
                                              ↓
                                    SVG/Canvas Rendering
```

### NeuromodDisplay Component

```typescript
class NeuromodDisplay {
  private data: NeuromodDisplayData
  private history: Array<{ timestamp, data }>

  update(metrics: SystemMetrics) {
    const levels = inferNeuromodLevels(state)
    this.data = {
      dopamine, serotonin, norepinephrine, cortisol,
      dominantState: computeDominantState(levels),
      explorationRate: compute...,
      temporalDiscount: compute...,
      precisionGain: compute...,
      riskTolerance: compute...
    }
    addToHistory()
    notifySubscribers()
  }

  getVisualizationData() → Array<{name, level, color, label, description}>
  getDominantStateVisualization() → {state, color, icon, description}
  getBehavioralEffects() → Array<{name, value, display, color}>
}
```

**Data Flow:**
```
SystemMetrics → inferLevels() → NeuromodDisplayData → Subscribers
                                                     ↓
                                        getVisualizationData()
                                                     ↓
                                          Radial Gauges/Bars
```

### EconomyCard Component

```typescript
class EconomyCard {
  private data: EconomyCardData
  private revenueHistory: Array<{timestamp, revenue}>
  private costHistory: Array<{timestamp, cost}>

  update(metrics: SystemMetrics) {
    const revenue = estimateRevenue(metrics)
    const cost = metrics.llm.totalCost
    this.data = {
      totalRevenue, totalCost,
      netIncome: revenue - cost,
      roi: (netIncome / cost) * 100,
      nessDeviation: estimateNESS(),
      sustainable: netIncome >= 0,
      runway: calculateRunway(),
      status: computeStatus()
    }
    addToHistory(revenue, cost)
  }

  getMetrics() → Array<{label, value, trend, color}>
  getStatusIndicator() → {status, color, icon, message}
  getChartData() → {revenue[], cost[], net[]}
  getNESSInfo() → {deviation, convergenceRate, estimatedCycles}
}
```

**Data Flow:**
```
SystemMetrics → calculate($) → EconomyCardData → Subscribers
                                               ↓
                                    getChartData()
                                               ↓
                                      Sparkline/Chart
```

### AgentNetwork Component

```typescript
class AgentNetwork {
  private data: AgentNetworkData

  update(metrics: SystemMetrics) {
    const nodes = buildNodes(agents, llm, mcp)
    const connections = buildConnections(nodes)
    this.data = {
      totalAgents, activeAgents, utilization,
      avgLatency, totalRequests,
      providers: string[],
      nodes: AgentNode[],
      connections: AgentConnection[]
    }
  }

  getNodePositions(width, height) → Map<id, {x, y}>
  getConnectionPaths(positions) → Array<{path, color, width, animated}>
  getNodeVisualization(node) → {radius, color, strokeColor, icon}
}
```

**Data Flow:**
```
SystemMetrics → buildGraph() → AgentNetworkData → Subscribers
                                                 ↓
                                    getNodePositions()
                                                 ↓
                                      Force-Directed Layout
                                                 ↓
                                        SVG/Canvas Graph
```

## Observable Pattern

All components use the Observable pattern for reactivity:

```typescript
interface Observable<T> {
  subscribe(callback: (data: T) => void): Unsubscriber
  getValue(): T
}

// Usage
const unsubscribe = component.subscribe((data) => {
  console.log('Updated:', data)
})

// Later
unsubscribe()
```

This enables:
- Framework-agnostic integration
- Efficient updates (only when data changes)
- Memory-safe subscriptions (explicit cleanup)
- Multiple subscribers per component

## State Management

```
┌─────────────────────────────────────────────────────────────┐
│                    Observatory                               │
│                                                               │
│  currentState: UIState                                       │
│  subscribers: Set<Subscriber<UIState>>                       │
│                                                               │
│  ┌─────────────────────────────────────────────────┐        │
│  │  SSEClient                                       │        │
│  │    onMetrics() → handleMetricsUpdate()          │        │
│  │    onEvent() → handleEventUpdate()              │        │
│  │    onConnectionChange() → updateConnectionState()│        │
│  └─────────────────────────────────────────────────┘        │
│                         ↓                                     │
│  ┌─────────────────────────────────────────────────┐        │
│  │  StateMapper                                     │        │
│  │    mapToUIState()                                │        │
│  │      → compute derived metrics                   │        │
│  │      → categorize events                         │        │
│  │      → track trends                              │        │
│  └─────────────────────────────────────────────────┘        │
│                         ↓                                     │
│  ┌─────────────────────────────────────────────────┐        │
│  │  Update Components                               │        │
│  │    phiOrb.update(metrics)                        │        │
│  │    neuromod.update(metrics)                      │        │
│  │    economy.update(metrics)                       │        │
│  │    agents.update(metrics)                        │        │
│  └─────────────────────────────────────────────────┘        │
│                         ↓                                     │
│  ┌─────────────────────────────────────────────────┐        │
│  │  Notify Subscribers                              │        │
│  │    for (subscriber of subscribers)               │        │
│  │      subscriber(currentState)                    │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Framework Integration

### React Hooks

```typescript
function useObservatory() {
  const [state, setState] = useState<UIState | null>(null)
  const observatoryRef = useRef<Observatory>()

  useEffect(() => {
    observatoryRef.current = getObservatory()
    observatoryRef.current.connect()

    const unsubscribe = observatoryRef.current.subscribe(setState)

    return () => {
      unsubscribe()
      observatoryRef.current?.disconnect()
    }
  }, [])

  return state
}
```

### Vue Composable

```typescript
function useObservatory() {
  const state = ref<UIState | null>(null)
  const observatory = getObservatory()
  let unsubscribe: Unsubscriber

  onMounted(() => {
    observatory.connect()
    unsubscribe = observatory.subscribe((s) => {
      state.value = s
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
    observatory.disconnect()
  })

  return { state }
}
```

## Performance Considerations

### Polling vs SSE

- **Polling** (default): Fetch `/api/metrics` every 1000ms
  - Pros: Simple, reliable, works everywhere
  - Cons: 1s latency, constant traffic

- **SSE** (optional): Real-time event stream
  - Pros: Instant updates, lower latency
  - Cons: Browser compatibility, firewall issues

Both run in parallel for reliability.

### Bounded History

All components limit history size:
- `PhiOrb`: No history (current state only)
- `NeuromodDisplay`: 60 samples (1 minute @ 1s interval)
- `EconomyCard`: 100 samples
- `AgentNetwork`: 60 samples

This prevents memory leaks in long-running sessions.

### Efficient Updates

Components only notify subscribers when data changes:
- `PhiOrb`: Only if phi changes by > 0.01
- `NeuromodDisplay`: On every update (levels change frequently)
- `EconomyCard`: On every update (accumulating totals)
- `AgentNetwork`: On every update (dynamic graph)

## Security

- **No authentication**: UI connects to public dashboard endpoint
- **Read-only**: UI cannot modify Genesis state
- **CORS**: Dashboard enables `Access-Control-Allow-Origin: *`
- **Local-only**: Default dashboard only binds to `localhost:9876`

For production deployment:
- Use reverse proxy with authentication
- Enable HTTPS
- Restrict CORS to specific origins
- Use API keys for /api/metrics endpoint

## Future Enhancements

- [ ] WebSocket support (fallback from SSE)
- [ ] Historical data replay
- [ ] Time-series database integration
- [ ] Alert/notification system
- [ ] Dashboard configuration UI
- [ ] Component themes/styling
- [ ] Export to PDF/PNG
- [ ] Mobile-optimized views
- [ ] Multi-Genesis monitoring (fleet view)
