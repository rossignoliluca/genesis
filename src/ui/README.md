# Genesis Observatory UI

Framework-agnostic TypeScript UI system for real-time Genesis monitoring and visualization.

## Architecture

```
Genesis Observatory
├── SSEClient - Server-Sent Events connection to dashboard
├── StateMapper - Maps system metrics to UI-friendly data
├── Components
│   ├── PhiOrb - Consciousness (φ) visualization
│   ├── NeuromodDisplay - Neuromodulator levels & effects
│   ├── EconomyCard - Revenue, costs, NESS metrics
│   └── AgentNetwork - Agent network graph
└── Observatory - Main orchestrator
```

## Quick Start

### Basic Usage

```typescript
import { createObservatory } from './ui';

// Connect to Genesis dashboard
const observatory = createObservatory({
  dashboardUrl: 'http://localhost:9876',
  refreshInterval: 1000,
  enableSSE: true,
});

observatory.connect();

// Subscribe to state updates
observatory.subscribe((state) => {
  console.log('φ:', state.metrics?.consciousness.phi);
  console.log('Economy:', state.computed.economicHealth);
  console.log('Agents:', state.metrics?.agents.active);
});
```

### Using Individual Components

```typescript
import { getPhiOrb, getNeuromodDisplay } from './ui/components';

// Phi Orb - Consciousness visualization
const phiOrb = getPhiOrb();
phiOrb.subscribe((data) => {
  console.log(`φ = ${data.phi.toFixed(3)} | ${data.quality} | ${data.trend}`);
});

// Get SVG visualization data
const viz = phiOrb.getVisualization();
const path = generatePhiOrbPath(phiOrb.getData());

// Neuromodulation Display
const neuromod = getNeuromodDisplay();
neuromod.subscribe((data) => {
  console.log('Dominant state:', data.dominantState);
  console.log('Dopamine:', data.dopamine);
  console.log('Exploration rate:', data.explorationRate);
});
```

### Snapshot State

```typescript
import { getGenesisState } from './ui';

// Get current state without subscription
const state = await getGenesisState('http://localhost:9876');
console.log('Current φ:', state.metrics?.consciousness.phi);
```

## Components

### Phi Orb

Visualizes integrated information (φ) as an animated orb.

```typescript
const phiOrb = getPhiOrb();

// Get data
const data = phiOrb.getData();
// {
//   phi: 0.742,
//   state: 'awake',
//   integration: 0.85,
//   trend: 'rising',
//   quality: 'good',
//   color: '#00ff88',
//   pulseRate: 2000
// }

// Get visualization properties
const viz = phiOrb.getVisualization();
// {
//   radius: 87.1,
//   opacity: 0.897,
//   glowIntensity: 1.484,
//   rotation: 123.456,
//   particleCount: 74
// }

// Generate SVG path
const path = generatePhiOrbPath(data);
```

### Neuromodulation Display

Shows dopamine, serotonin, norepinephrine, and cortisol levels with computed behavioral effects.

```typescript
const neuromod = getNeuromodDisplay();

// Get visualization data
const mods = neuromod.getVisualizationData();
// [
//   { name: 'Dopamine', level: 0.7, color: '#ff6b9d', ... },
//   { name: 'Serotonin', level: 0.6, ... },
//   ...
// ]

// Get dominant state
const state = neuromod.getDominantStateVisualization();
// {
//   state: 'focused',
//   color: '#ffa726',
//   icon: '🎯',
//   description: 'High precision and attention'
// }

// Get behavioral effects
const effects = neuromod.getBehavioralEffects();
// [
//   { name: 'Exploration', value: 0.65, display: '65%', ... },
//   { name: 'Patience', value: 0.88, display: '88%', ... },
//   ...
// ]
```

### Economy Card

Tracks revenue, costs, ROI, and NESS convergence.

```typescript
const economy = getEconomyCard();

// Get metrics
const metrics = economy.getMetrics();
// [
//   { label: 'Total Revenue', value: '$1.2K', trend: 'up', ... },
//   { label: 'Net Income', value: '$850', trend: 'up', ... },
//   { label: 'NESS Deviation', value: '15%', ... },
//   ...
// ]

// Get status
const status = economy.getStatusIndicator();
// {
//   status: 'sustainable',
//   color: '#00ff88',
//   icon: '✓',
//   message: 'Economy is sustainable and growing'
// }

// Get NESS info
const ness = economy.getNESSInfo();
// {
//   deviation: 0.15,
//   convergenceRate: 0.85,
//   estimatedCycles: 15,
//   atSteadyState: false
// }

// Get chart data
const chart = economy.getChartData();
// {
//   revenue: [{ x: timestamp, y: 1200 }, ...],
//   cost: [{ x: timestamp, y: 350 }, ...],
//   net: [{ x: timestamp, y: 850 }, ...]
// }
```

### Agent Network

Visualizes agent connections and system topology.

```typescript
const agents = getAgentNetwork();

// Get stats
const stats = agents.getStats();
// [
//   { label: 'Total Agents', value: '5', color: '#00ff88' },
//   { label: 'Utilization', value: '80%', ... },
//   ...
// ]

// Get network graph
const data = agents.getData();
const positions = agents.getNodePositions(800, 600);
const connections = agents.getConnectionPaths(positions);

// Render network
connections.forEach((conn) => {
  // <path d={conn.path} stroke={conn.color} stroke-width={conn.width} />
});
```

## State Mapping

The `StateMapper` transforms raw `SystemMetrics` into UI-friendly structures:

```typescript
import { getStateMapper } from './ui';

const mapper = getStateMapper();

// Map metrics to UI state
const uiState = mapper.mapToUIState(metrics, events, connected);

// Map to specific components
const phiData = mapper.mapToPhiOrb(metrics);
const neuromodData = mapper.mapToNeuromod(metrics);
const economyData = mapper.mapToEconomy(metrics);
const agentData = mapper.mapToAgentNetwork(metrics);
```

## SSE Client

Manages Server-Sent Events connection to the Genesis dashboard.

```typescript
import { createSSEClient } from './ui';

const client = createSSEClient({
  dashboardUrl: 'http://localhost:9876',
  refreshInterval: 1000,
  enableSSE: true,
  autoReconnect: true,
  reconnectDelay: 3000,
});

// Connect
client.connect();

// Subscribe to metrics
client.onMetrics((metrics) => {
  console.log('φ:', metrics.consciousness.phi);
});

// Subscribe to events
client.onEvent((event) => {
  console.log('Event:', event.type, event.data);
});

// Subscribe to connection changes
client.onConnectionChange((connected) => {
  console.log('Connected:', connected);
});

// Disconnect
client.disconnect();
```

## Integration with Frameworks

### React

```typescript
import { useEffect, useState } from 'react';
import { getObservatory } from './ui';

function GenesisMonitor() {
  const [state, setState] = useState(null);
  const observatory = getObservatory();

  useEffect(() => {
    observatory.connect();
    const unsubscribe = observatory.subscribe(setState);
    return () => {
      unsubscribe();
      observatory.disconnect();
    };
  }, []);

  if (!state) return <div>Loading...</div>;

  return (
    <div>
      <h1>φ = {state.metrics.consciousness.phi.toFixed(3)}</h1>
      <p>Status: {state.computed.systemHealth}</p>
    </div>
  );
}
```

### Vue

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { getObservatory } from './ui';

export default {
  setup() {
    const state = ref(null);
    const observatory = getObservatory();
    let unsubscribe;

    onMounted(() => {
      observatory.connect();
      unsubscribe = observatory.subscribe((s) => {
        state.value = s;
      });
    });

    onUnmounted(() => {
      unsubscribe?.();
      observatory.disconnect();
    });

    return { state };
  },
};
```

### Svelte

```typescript
import { onMount, onDestroy } from 'svelte';
import { getObservatory } from './ui';

let state = null;
const observatory = getObservatory();
let unsubscribe;

onMount(() => {
  observatory.connect();
  unsubscribe = observatory.subscribe((s) => {
    state = s;
  });
});

onDestroy(() => {
  unsubscribe?.();
  observatory.disconnect();
});
```

### Vanilla JavaScript

```html
<div id="genesis-phi"></div>
<div id="genesis-status"></div>

<script type="module">
  import { connectToGenesis } from './ui/index.js';

  const observatory = connectToGenesis('http://localhost:9876');

  observatory.subscribe((state) => {
    document.getElementById('genesis-phi').textContent =
      `φ = ${state.metrics?.consciousness.phi.toFixed(3) || '---'}`;

    document.getElementById('genesis-status').textContent =
      `Status: ${state.computed.systemHealth}`;
  });
</script>
```

## Data Flow

```
Genesis System
      ↓
Dashboard Server (:9876)
      ↓
  /api/metrics (polling)
  /api/events (SSE)
      ↓
   SSEClient
      ↓
  StateMapper
      ↓
  Components (PhiOrb, Neuromod, Economy, Agents)
      ↓
 Observatory
      ↓
Your UI Framework
```

## Type Definitions

All types are fully typed with TypeScript:

- `UIState` - Complete UI state
- `SystemMetrics` - Raw metrics from dashboard
- `PhiOrbData` - Phi visualization data
- `NeuromodDisplayData` - Neuromodulator data
- `EconomyCardData` - Economic metrics
- `AgentNetworkData` - Agent network graph
- `UIConfig` - Configuration options

See `src/ui/types.ts` for complete type definitions.

## Testing

```typescript
import { createObservatory } from './ui';

// Mock dashboard
const observatory = createObservatory({
  dashboardUrl: 'http://localhost:9999', // Test server
});

// Test connection
observatory.connect();
expect(observatory.isConnected()).toBe(true);

// Test state updates
observatory.subscribe((state) => {
  expect(state.metrics).toBeDefined();
  expect(state.computed.phiQuality).toMatch(/excellent|good|degraded|critical/);
});
```

## Performance

- **Polling**: Configurable refresh interval (default 1000ms)
- **SSE**: Real-time event stream with auto-reconnect
- **Efficient**: Only re-renders when data changes
- **Lightweight**: No dependencies, pure TypeScript
- **Memory**: Bounded history (configurable max events)

## Visualization Helpers

### Phi Orb

- `generatePhiOrbPath()` - SVG path for consciousness orb
- `generatePhiParticles()` - Particle positions for visualization
- `getPhiGradient()` - Color gradient based on quality

### Neuromodulation

- `generateNeuromodGaugePath()` - Radial gauge for each modulator

### Economy

- `generateSparklinePath()` - Revenue/cost sparkline
- `getNESSProgressBar()` - NESS convergence progress

### Agent Network

- `calculateForceLayout()` - Force-directed graph layout
- `generatePulseAnimation()` - Animated connection pulses

## License

MIT - Part of Genesis v9.0+
