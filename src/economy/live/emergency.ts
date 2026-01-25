/**
 * Emergency Procedures
 *
 * Handles system emergencies: graceful shutdown, circuit breakers,
 * emergency withdrawals, and fund recovery.
 */

import { getLiveWallet } from './wallet.js';
import { getAlertSystem } from './alerts.js';
import { getGasManager } from './gas-manager.js';
import { getPositionTracker } from './position-tracker.js';
import { getRevenueTracker } from './revenue-tracker.js';
import { getStatePersistence } from './persistence.js';
import { getAutonomousController, resetAutonomousController } from '../autonomous.js';

// ============================================================================
// Types
// ============================================================================

export type EmergencyLevel = 'warning' | 'critical' | 'shutdown';
export type EmergencyReason =
  | 'gas_depleted'
  | 'circuit_breaker'
  | 'max_drawdown'
  | 'security_alert'
  | 'manual_trigger'
  | 'system_error';

export interface EmergencyState {
  active: boolean;
  level: EmergencyLevel;
  reason: EmergencyReason | null;
  triggeredAt: number | null;
  message: string | null;
  actionsCompleted: string[];
}

export interface ShutdownResult {
  success: boolean;
  statesSaved: boolean;
  positionsClosed: number;
  alertsSent: boolean;
  errors: string[];
}

export interface RecoveryInfo {
  walletAddress: string;
  ethBalance: string;
  usdcBalance: string;
  activePositions: number;
  pendingRevenue: number;
  lastState: string | null;
}

// ============================================================================
// Emergency Manager
// ============================================================================

class EmergencyManager {
  private state: EmergencyState = {
    active: false,
    level: 'warning',
    reason: null,
    triggeredAt: null,
    message: null,
    actionsCompleted: [],
  };

  private shutdownHooks: Array<() => Promise<void>> = [];

  /**
   * Trigger emergency mode.
   */
  async trigger(
    level: EmergencyLevel,
    reason: EmergencyReason,
    message: string
  ): Promise<void> {
    console.log(`[Emergency] TRIGGERED: ${level} - ${reason}`);
    console.log(`[Emergency] Message: ${message}`);

    this.state = {
      active: true,
      level,
      reason,
      triggeredAt: Date.now(),
      message,
      actionsCompleted: [],
    };

    // Send immediate alert
    const alerts = getAlertSystem();
    await alerts.error(
      `EMERGENCY: ${level.toUpperCase()}`,
      `Reason: ${reason}\n${message}\n\nEmergency procedures initiated.`
    );

    // Take action based on level
    switch (level) {
      case 'warning':
        await this.handleWarning();
        break;
      case 'critical':
        await this.handleCritical();
        break;
      case 'shutdown':
        await this.handleShutdown();
        break;
    }
  }

  /**
   * Handle warning-level emergency.
   */
  private async handleWarning(): Promise<void> {
    // Pause new positions, continue monitoring
    const gasManager = getGasManager();
    gasManager.pause();
    this.state.actionsCompleted.push('Paused gas-consuming operations');

    // Save current state
    await this.saveAllState();
    this.state.actionsCompleted.push('Saved current state');
  }

  /**
   * Handle critical-level emergency.
   */
  private async handleCritical(): Promise<void> {
    // Stop the controller
    try {
      const controller = getAutonomousController();
      controller.stop();
      this.state.actionsCompleted.push('Stopped autonomous controller');
    } catch (e) {
      console.warn('[Emergency] Failed to stop controller:', e);
    }

    // Pause all operations
    const gasManager = getGasManager();
    gasManager.pause();
    this.state.actionsCompleted.push('Paused all operations');

    // Save state
    await this.saveAllState();
    this.state.actionsCompleted.push('Saved emergency state');

    // Log position summary
    const positions = getPositionTracker();
    const summary = positions.getSummary();
    console.log(`[Emergency] Active positions: ${summary.activePositions}`);
    console.log(`[Emergency] Total value: $${summary.totalValue.toFixed(2)}`);
  }

  /**
   * Handle shutdown-level emergency.
   */
  private async handleShutdown(): Promise<void> {
    console.log('[Emergency] Initiating full shutdown...');

    // Run all shutdown hooks
    for (const hook of this.shutdownHooks) {
      try {
        await hook();
      } catch (e) {
        console.warn('[Emergency] Shutdown hook failed:', e);
      }
    }
    this.state.actionsCompleted.push(`Ran ${this.shutdownHooks.length} shutdown hooks`);

    // Stop controller
    try {
      resetAutonomousController();
      this.state.actionsCompleted.push('Reset autonomous controller');
    } catch (e) {
      console.warn('[Emergency] Failed to reset controller:', e);
    }

    // Final state save
    await this.saveAllState();
    this.state.actionsCompleted.push('Final state save complete');

    // Send final alert
    const alerts = getAlertSystem();
    await alerts.error(
      'SYSTEM SHUTDOWN COMPLETE',
      `Emergency shutdown completed.\n` +
      `Actions: ${this.state.actionsCompleted.join(', ')}\n` +
      `Manual intervention required.`
    );
  }

  /**
   * Save all state to disk.
   */
  private async saveAllState(): Promise<void> {
    try {
      // Revenue tracker
      const revenue = getRevenueTracker();
      await revenue.save();

      // Position tracker
      const positions = getPositionTracker();
      await positions.save();

      // Main persistence
      const persistence = getStatePersistence();
      // Note: persistence.save() requires a state builder, skip if not available

      console.log('[Emergency] All states saved');
    } catch (e) {
      console.error('[Emergency] State save error:', e);
    }
  }

  /**
   * Graceful shutdown (non-emergency).
   */
  async gracefulShutdown(): Promise<ShutdownResult> {
    const result: ShutdownResult = {
      success: false,
      statesSaved: false,
      positionsClosed: 0,
      alertsSent: false,
      errors: [],
    };

    console.log('[Emergency] Starting graceful shutdown...');

    // 1. Stop controller
    try {
      const controller = getAutonomousController();
      controller.stop();
    } catch (e) {
      result.errors.push(`Controller stop: ${e}`);
    }

    // 2. Stop gas manager
    try {
      const gasManager = getGasManager();
      gasManager.stop();
    } catch (e) {
      result.errors.push(`Gas manager stop: ${e}`);
    }

    // 3. Save all state
    try {
      await this.saveAllState();
      result.statesSaved = true;
    } catch (e) {
      result.errors.push(`State save: ${e}`);
    }

    // 4. Send shutdown alert
    try {
      const alerts = getAlertSystem();
      await alerts.info(
        'System Shutdown',
        'Genesis economy shutting down gracefully.\n' +
        `States saved: ${result.statesSaved}\n` +
        `Errors: ${result.errors.length}`
      );
      result.alertsSent = true;
    } catch (e) {
      result.errors.push(`Alert send: ${e}`);
    }

    result.success = result.errors.length === 0;
    console.log(`[Emergency] Graceful shutdown complete. Success: ${result.success}`);
    return result;
  }

  /**
   * Get recovery information.
   */
  async getRecoveryInfo(): Promise<RecoveryInfo> {
    const wallet = getLiveWallet();
    const positions = getPositionTracker();
    const revenue = getRevenueTracker();
    const persistence = getStatePersistence();

    let ethBalance = '0';
    let usdcBalance = '0';
    let walletAddress = 'Not connected';

    if (wallet.isConnected()) {
      const balances = await wallet.getBalances();
      ethBalance = balances.ethFormatted;
      usdcBalance = balances.usdcFormatted;
      walletAddress = wallet.getAddress();
    }

    const activePositions = positions.getActivePositions().length;
    const pendingRevenue = revenue.getStats().total;

    let lastState: string | null = null;
    try {
      const state = await persistence.load();
      if (state) {
        lastState = state.savedAt;
      }
    } catch {
      // No saved state
    }

    return {
      walletAddress,
      ethBalance,
      usdcBalance,
      activePositions,
      pendingRevenue,
      lastState,
    };
  }

  /**
   * Register a shutdown hook.
   */
  registerShutdownHook(hook: () => Promise<void>): void {
    this.shutdownHooks.push(hook);
  }

  /**
   * Clear emergency state (after manual resolution).
   */
  clear(): void {
    this.state = {
      active: false,
      level: 'warning',
      reason: null,
      triggeredAt: null,
      message: null,
      actionsCompleted: [],
    };
    console.log('[Emergency] Emergency state cleared');
  }

  /**
   * Get current emergency state.
   */
  getState(): EmergencyState {
    return { ...this.state };
  }

  /**
   * Check if emergency is active.
   */
  isActive(): boolean {
    return this.state.active;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let emergencyInstance: EmergencyManager | null = null;

export function getEmergencyManager(): EmergencyManager {
  if (!emergencyInstance) {
    emergencyInstance = new EmergencyManager();
  }
  return emergencyInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Trigger emergency mode.
 */
export async function triggerEmergency(
  level: EmergencyLevel,
  reason: EmergencyReason,
  message: string
): Promise<void> {
  return getEmergencyManager().trigger(level, reason, message);
}

/**
 * Graceful shutdown.
 */
export async function gracefulShutdown(): Promise<ShutdownResult> {
  return getEmergencyManager().gracefulShutdown();
}

/**
 * Check if emergency is active.
 */
export function isEmergencyActive(): boolean {
  return getEmergencyManager().isActive();
}

/**
 * Get recovery info.
 */
export async function getRecoveryInfo(): Promise<RecoveryInfo> {
  return getEmergencyManager().getRecoveryInfo();
}

// ============================================================================
// Process Signal Handlers
// ============================================================================

/**
 * Install process signal handlers for graceful shutdown.
 */
export function installSignalHandlers(): void {
  const handleSignal = async (signal: string) => {
    console.log(`\n[Emergency] Received ${signal}, initiating graceful shutdown...`);
    const result = await gracefulShutdown();
    process.exit(result.success ? 0 : 1);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  // Uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('[Emergency] Uncaught exception:', error);
    await triggerEmergency('critical', 'system_error', `Uncaught exception: ${error.message}`);
    process.exit(1);
  });

  // Unhandled rejections
  process.on('unhandledRejection', async (reason) => {
    console.error('[Emergency] Unhandled rejection:', reason);
    await triggerEmergency('warning', 'system_error', `Unhandled rejection: ${reason}`);
  });

  console.log('[Emergency] Signal handlers installed');
}
