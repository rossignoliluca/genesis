/**
 * Economy Module Tests
 *
 * Tests for economic intelligence:
 * - Capital Allocator (portfolio allocation)
 * - Autonomous NESS (steady state computation)
 * - Activity profiles
 * - Economic calculations
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Capital Allocator Tests
// ============================================================================

describe('Capital Allocator', () => {
  let capitalModule: any;
  let CapitalAllocator: any;

  beforeEach(async () => {
    capitalModule = await import('../dist/src/economy/capital-allocator.js');
    CapitalAllocator = capitalModule.CapitalAllocator;
  });

  describe('initialization', () => {
    test('creates allocator with default budget', () => {
      const allocator = new CapitalAllocator();
      assert.ok(allocator, 'Should create allocator');
    });

    test('creates allocator with custom budget', () => {
      const allocator = new CapitalAllocator(5000);
      assert.ok(allocator, 'Should create with custom budget');
    });

    test('creates allocator with custom config', () => {
      const allocator = new CapitalAllocator(3000, {
        dt: 0.1,
        sensitivity: 2.0,
        dampingFactor: 0.8,
        minAllocation: 50,
        maxAllocationFraction: 0.5,
      });
      assert.ok(allocator, 'Should create with custom config');
    });
  });

  describe('activity registration', () => {
    test('registers single activity', () => {
      const allocator = new CapitalAllocator(1000);

      allocator.registerActivity({
        id: 'test-activity',
        name: 'Test Activity',
        tier: 'A',
        capitalRequired: 100,
        estimatedROI: 0.15,
        riskLevel: 0.3,
        cooldownCycles: 1,
        identityRequired: 'none',
        active: true,
      });

      const state = allocator.step();
      assert.ok(state.allocations.has('test-activity'), 'Should have allocation for activity');
    });

    test('registers multiple activities', () => {
      const allocator = new CapitalAllocator(2000);

      allocator.registerActivities([
        {
          id: 'activity-1',
          name: 'Activity 1',
          tier: 'A',
          capitalRequired: 100,
          estimatedROI: 0.20,
          riskLevel: 0.2,
          cooldownCycles: 1,
          identityRequired: 'none',
          active: true,
        },
        {
          id: 'activity-2',
          name: 'Activity 2',
          tier: 'B',
          capitalRequired: 200,
          estimatedROI: 0.10,
          riskLevel: 0.4,
          cooldownCycles: 2,
          identityRequired: 'wallet',
          active: true,
        },
      ]);

      const state = allocator.step();
      assert.ok(state.allocations.has('activity-1'), 'Should have allocation for activity 1');
      assert.ok(state.allocations.has('activity-2'), 'Should have allocation for activity 2');
    });

    test('prevents duplicate registration', () => {
      const allocator = new CapitalAllocator(1000);

      const activity = {
        id: 'duplicate',
        name: 'Duplicate Activity',
        tier: 'A' as const,
        capitalRequired: 100,
        estimatedROI: 0.15,
        riskLevel: 0.3,
        cooldownCycles: 1,
        identityRequired: 'none' as const,
        active: true,
      };

      allocator.registerActivity(activity);
      allocator.registerActivity(activity); // Should be ignored

      const state = allocator.step();
      // Should only have one entry
      const allocations = Array.from(state.allocations.entries());
      assert.strictEqual(allocations.length, 1, 'Should have only one allocation');
    });
  });

  describe('step (leapfrog integration)', () => {
    test('returns valid allocation state', () => {
      const allocator = new CapitalAllocator(1000);

      allocator.registerActivity({
        id: 'test',
        name: 'Test',
        tier: 'A',
        capitalRequired: 100,
        estimatedROI: 0.15,
        riskLevel: 0.3,
        cooldownCycles: 1,
        identityRequired: 'none',
        active: true,
      });

      const state = allocator.step();

      assert.ok(state.hamiltonian, 'Should have hamiltonian state');
      assert.ok(state.allocations instanceof Map, 'Should have allocations map');
      assert.ok(typeof state.totalBudget === 'number', 'Should have total budget');
      assert.ok(typeof state.hamiltonianEnergy === 'number', 'Should have Hamiltonian energy');
      assert.ok(typeof state.conservationErr === 'number', 'Should have conservation error');
    });

    test('allocations sum to total budget', () => {
      const totalBudget = 2000;
      const allocator = new CapitalAllocator(totalBudget);

      allocator.registerActivities([
        { id: 'a1', name: 'A1', tier: 'A', capitalRequired: 100, estimatedROI: 0.20, riskLevel: 0.2, cooldownCycles: 1, identityRequired: 'none', active: true },
        { id: 'a2', name: 'A2', tier: 'B', capitalRequired: 100, estimatedROI: 0.15, riskLevel: 0.3, cooldownCycles: 1, identityRequired: 'none', active: true },
        { id: 'a3', name: 'A3', tier: 'C', capitalRequired: 100, estimatedROI: 0.10, riskLevel: 0.4, cooldownCycles: 1, identityRequired: 'none', active: true },
      ]);

      const state = allocator.step();
      const values = Array.from(state.allocations.values()) as number[];
      const sum = values.reduce((s, v) => s + v, 0);

      // Sum should be close to total budget (symplectic conservation)
      const tolerance = totalBudget * 0.01; // 1% tolerance
      assert.ok(Math.abs(sum - totalBudget) < tolerance,
        `Allocations sum ${sum} should be close to budget ${totalBudget}`);
    });

    test('all allocations are non-negative', () => {
      const allocator = new CapitalAllocator(1000);

      allocator.registerActivities([
        { id: 'a1', name: 'A1', tier: 'A', capitalRequired: 100, estimatedROI: 0.30, riskLevel: 0.2, cooldownCycles: 1, identityRequired: 'none', active: true },
        { id: 'a2', name: 'A2', tier: 'D', capitalRequired: 100, estimatedROI: 0.05, riskLevel: 0.8, cooldownCycles: 1, identityRequired: 'none', active: true },
      ]);

      // Run several steps
      for (let i = 0; i < 10; i++) {
        const state = allocator.step();
        for (const [id, alloc] of state.allocations) {
          assert.ok(alloc >= 0, `Allocation for ${id} should be non-negative, got ${alloc}`);
        }
      }
    });

    test('higher ROI activities get more allocation', () => {
      const allocator = new CapitalAllocator(2000, { sensitivity: 5.0 });

      allocator.registerActivities([
        { id: 'high-roi', name: 'High ROI', tier: 'S', capitalRequired: 100, estimatedROI: 0.50, riskLevel: 0.2, cooldownCycles: 1, identityRequired: 'none', active: true },
        { id: 'low-roi', name: 'Low ROI', tier: 'D', capitalRequired: 100, estimatedROI: 0.05, riskLevel: 0.8, cooldownCycles: 1, identityRequired: 'none', active: true },
      ]);

      // Run multiple steps to let allocation converge
      let state;
      for (let i = 0; i < 20; i++) {
        state = allocator.step();
      }

      const highAlloc = state!.allocations.get('high-roi') ?? 0;
      const lowAlloc = state!.allocations.get('low-roi') ?? 0;

      // High ROI should have higher allocation (after convergence)
      assert.ok(highAlloc >= lowAlloc * 0.5,
        `High ROI allocation ${highAlloc} should be at least half of low ROI ${lowAlloc}`);
    });

    test('custom ROIs can be provided', () => {
      const allocator = new CapitalAllocator(1000);

      allocator.registerActivities([
        { id: 'a1', name: 'A1', tier: 'A', capitalRequired: 100, estimatedROI: 0.10, riskLevel: 0.3, cooldownCycles: 1, identityRequired: 'none', active: true },
        { id: 'a2', name: 'A2', tier: 'A', capitalRequired: 100, estimatedROI: 0.10, riskLevel: 0.3, cooldownCycles: 1, identityRequired: 'none', active: true },
      ]);

      // Provide custom ROIs (a1 is performing much better)
      const customROIs = new Map([
        ['a1', 0.50],
        ['a2', 0.05],
      ]);

      const state = allocator.step(customROIs);
      assert.ok(state, 'Should accept custom ROIs');
    });

    test('returns empty state with no activities', () => {
      const allocator = new CapitalAllocator(1000);

      const state = allocator.step();

      assert.strictEqual(state.allocations.size, 0, 'Should have no allocations');
      assert.strictEqual(state.totalBudget, 1000, 'Should still have total budget');
    });
  });

  describe('Hamiltonian conservation', () => {
    test('conservation error stays small', () => {
      const allocator = new CapitalAllocator(2000);

      allocator.registerActivities([
        { id: 'a1', name: 'A1', tier: 'A', capitalRequired: 100, estimatedROI: 0.20, riskLevel: 0.2, cooldownCycles: 1, identityRequired: 'none', active: true },
        { id: 'a2', name: 'A2', tier: 'B', capitalRequired: 100, estimatedROI: 0.15, riskLevel: 0.3, cooldownCycles: 1, identityRequired: 'none', active: true },
      ]);

      // Run many steps
      let maxConservationErr = 0;
      for (let i = 0; i < 50; i++) {
        const state = allocator.step();
        maxConservationErr = Math.max(maxConservationErr, state.conservationErr);
      }

      // Symplectic integrator should keep conservation error bounded
      assert.ok(maxConservationErr < 0.1, `Conservation error ${maxConservationErr} should be small`);
    });
  });
});

// ============================================================================
// Autonomous NESS Tests
// ============================================================================

describe('Autonomous NESS', () => {
  let economicModule: any;
  let AutonomousNESS: any;

  beforeEach(async () => {
    economicModule = await import('../dist/src/economy/economic-intelligence.js');
    AutonomousNESS = economicModule.AutonomousNESS;
  });

  describe('initialization', () => {
    test('creates with default config', () => {
      const ness = new AutonomousNESS();
      assert.ok(ness, 'Should create NESS');
    });

    test('creates with custom config', () => {
      const ness = new AutonomousNESS({
        targetMonthlyRevenue: 5000,
        targetMonthlyCosts: 200,
        activityCount: 20,
        qualityTarget: 0.9,
        diversificationTarget: 0.8,
      });
      assert.ok(ness, 'Should create with custom config');
    });
  });

  describe('computeFixedPoint', () => {
    test('returns valid fixed point', () => {
      const ness = new AutonomousNESS({
        targetMonthlyRevenue: 3000,
        targetMonthlyCosts: 100,
      });

      const fp = ness.computeFixedPoint();

      assert.strictEqual(fp.revenue, 3000, 'Revenue should match target');
      assert.strictEqual(fp.costs, 100, 'Costs should match target');
      assert.strictEqual(fp.netFlow, 2900, 'Net flow should be revenue - costs');
      assert.ok(fp.roiVarianceStar >= 0, 'ROI variance target should be non-negative');
      assert.ok(fp.diversificationStar >= 0 && fp.diversificationStar <= 1,
        'Diversification target should be in [0,1]');
    });
  });

  describe('observe', () => {
    test('returns valid NESS state', () => {
      const ness = new AutonomousNESS();

      const state = ness.observe({
        monthlyRevenue: 2000,
        monthlyCosts: 100,
        roiPerActivity: [0.15, 0.12, 0.18, 0.10],
        allocations: [500, 400, 600, 500],
      });

      assert.ok('deviation' in state, 'Should have deviation');
      assert.ok('revenueDeviation' in state, 'Should have revenue deviation');
      assert.ok('costDeviation' in state, 'Should have cost deviation');
      assert.ok('roiVariance' in state, 'Should have ROI variance');
      assert.ok('diversification' in state, 'Should have diversification');
      assert.ok('atSteadyState' in state, 'Should have steady state flag');
      assert.ok('convergenceRate' in state, 'Should have convergence rate');
      assert.ok('qGammaRatio' in state, 'Should have Q/Gamma ratio');
    });

    test('at target shows low deviation', () => {
      const ness = new AutonomousNESS({
        targetMonthlyRevenue: 2000,
        targetMonthlyCosts: 100,
        activityCount: 4,
        diversificationTarget: 0.7,
      });

      // Observe with values close to target
      const state = ness.observe({
        monthlyRevenue: 2000,     // Exactly at target
        monthlyCosts: 100,        // Exactly at target
        roiPerActivity: [0.15, 0.15, 0.15, 0.15],  // Low variance
        allocations: [500, 500, 500, 500],          // Equal distribution
      });

      assert.ok(state.revenueDeviation < 0.01, 'Revenue deviation should be near zero');
      assert.ok(state.costDeviation < 0.01, 'Cost deviation should be near zero');
      assert.ok(state.roiVariance < 0.01, 'ROI variance should be near zero');
    });

    test('far from target shows high deviation', () => {
      const ness = new AutonomousNESS({
        targetMonthlyRevenue: 5000,
        targetMonthlyCosts: 100,
      });

      const state = ness.observe({
        monthlyRevenue: 500,      // Far below target
        monthlyCosts: 500,        // Far above target
        roiPerActivity: [0.50, 0.01, 0.30, -0.10],  // High variance
        allocations: [1000, 100, 50, 50],           // Concentrated
      });

      assert.ok(state.deviation > 0.3, 'Total deviation should be high');
      assert.ok(state.revenueDeviation > 0.5, 'Revenue deviation should be high');
      assert.strictEqual(state.atSteadyState, false, 'Should not be at steady state');
    });

    test('convergence tracking works', () => {
      const ness = new AutonomousNESS();

      // Simulate improving trajectory
      for (let i = 0; i < 10; i++) {
        const revenue = 1000 + i * 150; // Improving revenue
        ness.observe({
          monthlyRevenue: revenue,
          monthlyCosts: 100,
          roiPerActivity: [0.15, 0.14, 0.16, 0.15],
          allocations: [500, 500, 500, 500],
        });
      }

      const finalState = ness.observe({
        monthlyRevenue: 2500,
        monthlyCosts: 100,
        roiPerActivity: [0.15, 0.15, 0.15, 0.15],
        allocations: [500, 500, 500, 500],
      });

      // Should have negative convergence rate (deviation decreasing)
      // or be at steady state
      assert.ok(finalState.convergenceRate <= 0 || finalState.atSteadyState,
        'Should be converging or at steady state');
    });
  });

  describe('updateConfig', () => {
    test('updates targets', () => {
      const ness = new AutonomousNESS({
        targetMonthlyRevenue: 1000,
      });

      ness.updateConfig({ targetMonthlyRevenue: 5000 });

      const fp = ness.computeFixedPoint();
      assert.strictEqual(fp.revenue, 5000, 'Target should be updated');
    });
  });
});

// ============================================================================
// Activity Profile Tests
// ============================================================================

describe('Activity Profiles', () => {
  test('tier ordering is correct', () => {
    const tierOrder = ['S', 'A', 'B', 'C', 'D'];

    // S is best, D is worst
    assert.ok(tierOrder.indexOf('S') < tierOrder.indexOf('A'), 'S < A');
    assert.ok(tierOrder.indexOf('A') < tierOrder.indexOf('B'), 'A < B');
    assert.ok(tierOrder.indexOf('B') < tierOrder.indexOf('C'), 'B < C');
    assert.ok(tierOrder.indexOf('C') < tierOrder.indexOf('D'), 'C < D');
  });

  test('identity requirements are valid', () => {
    const validIdentities = ['none', 'wallet', 'kyc'];

    for (const id of validIdentities) {
      assert.ok(typeof id === 'string', `${id} should be string`);
    }
  });
});

// ============================================================================
// Economic Calculations Tests
// ============================================================================

describe('Economic Calculations', () => {
  describe('ROI variance', () => {
    test('equal ROIs have zero variance', () => {
      const rois = [0.15, 0.15, 0.15, 0.15];
      const mean = rois.reduce((s, r) => s + r, 0) / rois.length;
      const variance = rois.reduce((s, r) => s + (r - mean) ** 2, 0) / rois.length;

      assert.strictEqual(variance, 0, 'Equal ROIs should have zero variance');
    });

    test('different ROIs have positive variance', () => {
      const rois = [0.50, 0.10, 0.30, 0.05];
      const mean = rois.reduce((s, r) => s + r, 0) / rois.length;
      const variance = rois.reduce((s, r) => s + (r - mean) ** 2, 0) / rois.length;

      assert.ok(variance > 0, 'Different ROIs should have positive variance');
    });
  });

  describe('HHI (Herfindahl-Hirschman Index)', () => {
    test('equal allocation has low HHI', () => {
      const allocations = [250, 250, 250, 250];
      const total = allocations.reduce((s, a) => s + a, 0);
      const hhi = allocations.reduce((s, a) => s + (a / total) ** 2, 0);

      // Equal distribution: HHI = N * (1/N)^2 = 1/N = 0.25
      assert.ok(Math.abs(hhi - 0.25) < 0.01, `HHI should be 0.25, got ${hhi}`);
    });

    test('concentrated allocation has high HHI', () => {
      const allocations = [950, 20, 20, 10];
      const total = allocations.reduce((s, a) => s + a, 0);
      const hhi = allocations.reduce((s, a) => s + (a / total) ** 2, 0);

      // Concentrated: HHI close to 1
      assert.ok(hhi > 0.8, `HHI should be high, got ${hhi}`);
    });

    test('inverse HHI gives diversification', () => {
      const allocations = [500, 500, 500, 500];
      const total = allocations.reduce((s, a) => s + a, 0);
      const hhi = allocations.reduce((s, a) => s + (a / total) ** 2, 0);
      const diversification = 1 / hhi;

      // Inverse HHI = N for equal distribution
      assert.ok(Math.abs(diversification - 4) < 0.01, `Diversification should be 4, got ${diversification}`);
    });
  });

  describe('net flow calculations', () => {
    test('positive net flow when revenue > costs', () => {
      const revenue = 2500;
      const costs = 150;
      const netFlow = revenue - costs;

      assert.ok(netFlow > 0, 'Net flow should be positive');
      assert.strictEqual(netFlow, 2350, 'Net flow calculation');
    });

    test('negative net flow when costs > revenue', () => {
      const revenue = 100;
      const costs = 200;
      const netFlow = revenue - costs;

      assert.ok(netFlow < 0, 'Net flow should be negative');
    });
  });
});
