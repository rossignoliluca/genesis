/**
 * Demo: Autonomous Loop with Value Integration
 *
 * Runs the autonomous inference loop with value-augmented policy selection.
 *
 * Run: node dist/src/active-inference/demo-autonomous-loop.js
 */

import {
  createValueIntegratedLoop,
} from './value-integration.js';

import {
  createAutonomousLoop,
  AutonomousLoop,
} from './index.js';

import { ActionType, ACTIONS } from './types.js';

// ============================================================================
// Simulated Environment
// ============================================================================

class SimulatedEnvironment {
  private energy: number = 0.5;
  private phi: number = 0.5;
  private taskProgress: number = 0;
  private cycle: number = 0;
  private state: 'idle' | 'sensing' | 'thinking' | 'acting' = 'idle';

  getKernelState(): { energy: number; state: string; taskStatus: string } {
    return {
      energy: this.energy,
      state: this.state,
      taskStatus: this.taskProgress >= 1 ? 'completed' :
                  this.taskProgress > 0 ? 'running' : 'pending',
    };
  }

  getPhiState(): { phi: number; state: string } {
    return {
      phi: this.phi,
      state: this.phi > 0.6 ? 'aware' : this.phi > 0.3 ? 'drowsy' : 'dormant',
    };
  }

  applyAction(action: ActionType): void {
    this.cycle++;

    // Natural decay
    this.energy = Math.max(0, this.energy - 0.05);
    this.phi = Math.max(0, this.phi - 0.02);

    // Action effects
    switch (action) {
      case 'recharge':
        this.energy = Math.min(1, this.energy + 0.3);
        this.state = 'idle';
        break;

      case 'sense.mcp':
        this.phi = Math.min(1, this.phi + 0.15);
        this.state = 'sensing';
        break;

      case 'recall.memory':
        this.phi = Math.min(1, this.phi + 0.1);
        break;

      case 'plan.goals':
        this.state = 'thinking';
        if (this.energy > 0.3) {
          this.taskProgress = Math.min(1, this.taskProgress + 0.15);
        }
        break;

      case 'execute.task':
        this.state = 'acting';
        if (this.energy > 0.4 && this.phi > 0.3) {
          this.taskProgress = Math.min(1, this.taskProgress + 0.25);
          this.energy = Math.max(0, this.energy - 0.1);
        }
        break;

      case 'dream.cycle':
        this.phi = Math.min(1, this.phi + 0.2);
        break;

      case 'rest.idle':
        this.energy = Math.min(1, this.energy + 0.1);
        this.state = 'idle';
        break;

      case 'verify.ethics':
        // Minor effect
        break;
    }
  }

  isGoalAchieved(): boolean {
    return this.taskProgress >= 1;
  }

  isCritical(): boolean {
    return this.energy <= 0.05;
  }

  getEnergyLevel(): number {
    return Math.round(this.energy * 4);
  }

  getTaskLevel(): number {
    return this.taskProgress >= 1 ? 3 :
           this.taskProgress > 0.5 ? 2 :
           this.taskProgress > 0 ? 1 : 0;
  }

  reset(): void {
    this.energy = 0.5;
    this.phi = 0.5;
    this.taskProgress = 0;
    this.cycle = 0;
    this.state = 'idle';
  }
}

// ============================================================================
// Visualization
// ============================================================================

function formatAction(action: ActionType): string {
  const icons: Record<string, string> = {
    'sense.mcp': '👁️ ',
    'recall.memory': '🧠',
    'plan.goals': '📋',
    'verify.ethics': '⚖️ ',
    'execute.task': '⚡',
    'dream.cycle': '💭',
    'rest.idle': '😴',
    'recharge': '🔋',
  };
  return `${icons[action] || '❓'} ${action}`;
}

function energyBar(level: number): string {
  const bars = ['▁', '▂', '▄', '▆', '█'];
  return bars[Math.min(4, Math.max(0, level))];
}

function taskProgress(level: number): string {
  const stages = ['○○○', '●○○', '●●○', '●●●'];
  return stages[Math.min(3, Math.max(0, level))];
}

// ============================================================================
// Demo 1: Basic Autonomous Loop
// ============================================================================

async function demoBasicLoop() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        Demo 1: Basic Autonomous Loop (20 cycles)              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const env = new SimulatedEnvironment();

  const loop = createAutonomousLoop({
    cycleInterval: 0,
    maxCycles: 20,
    stopOnGoalAchieved: true,
    stopOnEnergyCritical: true,
    verbose: false,
  });

  // Configure observation source using proper interface
  loop.configureObservations({
    kernelState: () => env.getKernelState() as any,
    phiState: () => env.getPhiState() as any,
  });

  console.log('Cycle │ Energy │ Task  │ Action');
  console.log('──────┼────────┼───────┼────────────────');

  loop.onCycle((cycle, action) => {
    env.applyAction(action);
    const e = env.getEnergyLevel();
    const t = env.getTaskLevel();
    console.log(
      `  ${cycle.toString().padStart(2)} │ ${energyBar(e)} E:${e} │ ` +
      `${taskProgress(t)} │ ${formatAction(action)}`
    );
  });

  const stats = await loop.run();

  console.log('──────┴────────┴───────┴────────────────\n');
  console.log(`Stopped after ${stats.cycles} cycles`);
  console.log(`Goal: ${env.isGoalAchieved() ? '✓ Achieved' : '✗ Not achieved'}`);
  console.log(`Actions: ${Object.entries(stats.actions).filter(([,c]) => c > 0).map(([a, c]) => `${a.split('.')[0]}:${c}`).join(', ')}`);
}

// ============================================================================
// Demo 2: Value-Integrated Autonomous Loop
// ============================================================================

async function demoValueIntegratedLoop() {
  console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║      Demo 2: Value-Integrated Autonomous Loop (30 cycles)     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const env = new SimulatedEnvironment();

  const { loop, valueEngine } = createValueIntegratedLoop({
    cycleInterval: 0,
    maxCycles: 30,
    stopOnGoalAchieved: true,
    stopOnEnergyCritical: true,
    verbose: false,
    valueIntegration: {
      valueWeight: 0.6,
      useWorldModelPredictions: false,
    },
  });

  loop.configureObservations({
    kernelState: () => env.getKernelState() as any,
    phiState: () => env.getPhiState() as any,
  });

  console.log('Cycle │ Energy │ Task  │ Value │ Action');
  console.log('──────┼────────┼───────┼───────┼────────────────');

  loop.onCycle((cycle, action) => {
    env.applyAction(action);

    const e = env.getEnergyLevel();
    const t = env.getTaskLevel();
    const veStats = valueEngine.getStats();

    console.log(
      `  ${cycle.toString().padStart(2)} │ ${energyBar(e)} E:${e} │ ` +
      `${taskProgress(t)} │ ${veStats.averageValue.toFixed(2)} │ ${formatAction(action)}`
    );
  });

  const stats = await loop.run();

  console.log('──────┴────────┴───────┴───────┴────────────────\n');

  const veStats = valueEngine.getStats();
  console.log('Value Engine Statistics:');
  console.log(`  Cycles: ${veStats.cycleCount}`);
  console.log(`  Avg Value: ${veStats.averageValue.toFixed(3)}`);
  console.log(`  Goal: ${env.isGoalAchieved() ? '✓ Achieved' : '✗ Not achieved'}`);
}

// ============================================================================
// Demo 3: Recovery Scenario
// ============================================================================

async function demoRecoveryScenario() {
  console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         Demo 3: Recovery from Critical State (40 cycles)      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const env = new SimulatedEnvironment();

  // Drain energy to critical
  for (let i = 0; i < 10; i++) {
    env.applyAction('execute.task');
  }

  console.log(`Starting state: Energy=${env.getKernelState().energy.toFixed(2)} (critical)\n`);

  const { loop, valueEngine } = createValueIntegratedLoop({
    cycleInterval: 0,
    maxCycles: 40,
    stopOnGoalAchieved: true,
    stopOnEnergyCritical: false,  // Don't stop - let it recover
    valueIntegration: {
      valueWeight: 0.7,
    },
  });

  loop.configureObservations({
    kernelState: () => env.getKernelState() as any,
    phiState: () => env.getPhiState() as any,
  });

  let phase = 'critical';
  const phases: string[] = [];

  console.log('Cycle │ Phase     │ Energy │ Task  │ Action');
  console.log('──────┼───────────┼────────┼───────┼────────────────');

  loop.onCycle((cycle, action) => {
    env.applyAction(action);

    const e = env.getEnergyLevel();
    const t = env.getTaskLevel();

    // Detect phase
    const newPhase = e <= 1 ? 'critical' :
                     e <= 2 ? 'recovering' :
                     t >= 3 ? 'complete' :
                     'executing';

    if (newPhase !== phase) {
      phases.push(`Cycle ${cycle}: ${phase} → ${newPhase}`);
      phase = newPhase;
    }

    const phaseIcon = {
      'critical': '🔴',
      'recovering': '🟡',
      'executing': '🟢',
      'complete': '🔵',
    }[phase] || '⚪';

    console.log(
      `  ${cycle.toString().padStart(2)} │ ${phaseIcon} ${phase.padEnd(9)} │ ` +
      `${energyBar(e)} E:${e} │ ${taskProgress(t)} │ ${formatAction(action)}`
    );
  });

  await loop.run();

  console.log('──────┴───────────┴────────┴───────┴────────────────\n');
  console.log('Phase Transitions:');
  phases.forEach(p => console.log(`  ${p}`));
  console.log(`\nFinal: Goal ${env.isGoalAchieved() ? '✓ Achieved' : '✗ Not achieved'}`);
}

// ============================================================================
// Demo 4: Comparison - With vs Without Value
// ============================================================================

async function demoComparison() {
  console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║      Demo 4: Comparison - Basic vs Value-Integrated           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const runExperiment = async (useValue: boolean): Promise<{
    cycles: number;
    goalAchieved: boolean;
    actions: Record<string, number>;
  }> => {
    const env = new SimulatedEnvironment();

    let loop: AutonomousLoop;
    if (useValue) {
      const result = createValueIntegratedLoop({
        cycleInterval: 0,
        maxCycles: 35,
        stopOnGoalAchieved: true,
        stopOnEnergyCritical: true,
      });
      loop = result.loop;
    } else {
      loop = createAutonomousLoop({
        cycleInterval: 0,
        maxCycles: 35,
        stopOnGoalAchieved: true,
        stopOnEnergyCritical: true,
      });
    }

    loop.configureObservations({
      kernelState: () => env.getKernelState() as any,
      phiState: () => env.getPhiState() as any,
    });

    loop.onCycle((_, action) => env.applyAction(action));

    const stats = await loop.run();

    return {
      cycles: stats.cycles,
      goalAchieved: env.isGoalAchieved(),
      actions: stats.actions,
    };
  };

  const trials = 5;
  console.log(`Running ${trials} trials each...\n`);

  const basicResults: Awaited<ReturnType<typeof runExperiment>>[] = [];
  const valueResults: Awaited<ReturnType<typeof runExperiment>>[] = [];

  for (let i = 0; i < trials; i++) {
    basicResults.push(await runExperiment(false));
    valueResults.push(await runExperiment(true));
  }

  const analyze = (results: typeof basicResults) => ({
    avgCycles: results.reduce((s, r) => s + r.cycles, 0) / trials,
    goalRate: results.filter(r => r.goalAchieved).length / trials * 100,
  });

  const basic = analyze(basicResults);
  const value = analyze(valueResults);

  console.log('                    │ Basic Loop │ Value-Integrated');
  console.log('────────────────────┼────────────┼──────────────────');
  console.log(`  Avg Cycles        │ ${basic.avgCycles.toFixed(1).padStart(10)} │ ${value.avgCycles.toFixed(1).padStart(16)}`);
  console.log(`  Goal Achieved %   │ ${basic.goalRate.toFixed(0).padStart(9)}% │ ${value.goalRate.toFixed(0).padStart(15)}%`);

  console.log('\nAction distribution (last trial):');
  const lastBasic = basicResults[basicResults.length - 1].actions;
  const lastValue = valueResults[valueResults.length - 1].actions;

  for (const action of ACTIONS) {
    const b = lastBasic[action] || 0;
    const v = lastValue[action] || 0;
    if (b > 0 || v > 0) {
      console.log(`  ${action.padEnd(14)} │ ${b.toString().padStart(10)} │ ${v.toString().padStart(16)}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n🔄 Genesis 6.2 - Autonomous Loop with Value Integration\n');

  await demoBasicLoop();
  await demoValueIntegratedLoop();
  await demoRecoveryScenario();
  await demoComparison();

  console.log('\n✓ All demos complete!\n');
}

main().catch(console.error);
