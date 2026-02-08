/**
 * Genesis Dashboard Component Library
 *
 * Comprehensive collection of reusable components for the Genesis dashboard.
 */

// ============================================================================
// Display Components
// ============================================================================
export { CircularGauge } from './display/CircularGauge';
export { PhiGauge } from './display/PhiGauge';
export { FreeEnergyGauge } from './display/FreeEnergyGauge';

// ============================================================================
// Chart Components
// ============================================================================
export { TimeSeriesChart } from './charts/TimeSeriesChart';
export { RadarChart } from './charts/RadarChart';
export { SankeyDiagram } from './charts/SankeyDiagram';

// ============================================================================
// Graph Components
// ============================================================================
export { NetworkGraph, TreeGraph } from './graphs/NetworkGraph';

// ============================================================================
// Visualization Components
// ============================================================================
export { SwarmVisualization } from './viz/SwarmVisualization';
export { NeuromodBalanceViz } from './viz/NeuromodBalanceViz';
export { WorkspaceVisualization } from './viz/WorkspaceVisualization';
export { PainBodyMap } from './viz/PainBodyMap';

// ============================================================================
// Status Components
// ============================================================================
export {
  StatusIndicator,
  InvariantBadge,
  ConnectionStatus,
} from './status/StatusIndicator';

// ============================================================================
// Card Components
// ============================================================================
export { MetricCard, StatusCard, AlertCard } from './cards/MetricCard';

// ============================================================================
// Layout Components
// ============================================================================
export { Panel, PanelGrid, SplitPane } from './layout/Panel';

// ============================================================================
// Table Components
// ============================================================================
export { DataTable, EventLog } from './tables/DataTable';
