/**
 * 🏥 Genesis Self-Diagnostics
 *
 * Self-monitoring and health reporting for autonomous operation.
 * Created autonomously by Genesis on 2026-01-12T12:56:44.606Z
 */

import * as os from 'os';
import * as process from 'process';

export interface DiagnosticReport {
  timestamp: string;
  system: SystemInfo;
  process: ProcessInfo;
  genesis: GenesisInfo;
  health: HealthStatus;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  cpuCount: number;
  totalMemory: string;
  freeMemory: string;
  uptime: string;
}

export interface ProcessInfo {
  pid: number;
  memoryUsage: {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string;
  };
  uptime: string;
}

export interface GenesisInfo {
  version: string;
  evolutions: number;
  capabilities: string[];
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Run all health checks
 */
function runHealthChecks(): HealthCheck[] {
  const checks: HealthCheck[] = [];

  // Memory check
  const memUsage = process.memoryUsage();
  const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  checks.push({
    name: 'memory',
    status: heapPercent < 70 ? 'pass' : heapPercent < 90 ? 'warn' : 'fail',
    message: `Heap: ${heapPercent.toFixed(1)}% used`,
  });

  // System memory check
  const freeMemPercent = (os.freemem() / os.totalmem()) * 100;
  checks.push({
    name: 'system_memory',
    status: freeMemPercent > 20 ? 'pass' : freeMemPercent > 10 ? 'warn' : 'fail',
    message: `Free: ${freeMemPercent.toFixed(1)}%`,
  });

  // Uptime check
  const uptimeHours = process.uptime() / 3600;
  checks.push({
    name: 'uptime',
    status: uptimeHours < 24 ? 'pass' : uptimeHours < 168 ? 'warn' : 'fail',
    message: `Running for ${formatDuration(process.uptime())}`,
  });

  return checks;
}

/**
 * Generate a full diagnostic report
 */
export function generateDiagnostics(): DiagnosticReport {
  const memUsage = process.memoryUsage();
  const checks = runHealthChecks();

  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  return {
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemory: formatBytes(os.totalmem()),
      freeMemory: formatBytes(os.freemem()),
      uptime: formatDuration(os.uptime()),
    },
    process: {
      pid: process.pid,
      memoryUsage: {
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        external: formatBytes(memUsage.external),
        rss: formatBytes(memUsage.rss),
      },
      uptime: formatDuration(process.uptime()),
    },
    genesis: {
      version: '7.5.1',
      evolutions: 3,
      capabilities: [
        'active-inference',
        'self-modification',
        'secure-shell-execution',
        'git-auto-push',
        'self-diagnostics',
      ],
    },
    health: {
      overall: failCount > 0 ? 'unhealthy' : warnCount > 0 ? 'degraded' : 'healthy',
      checks,
    },
  };
}

/**
 * Print diagnostics to console
 */
export function printDiagnostics(): void {
  const report = generateDiagnostics();

  console.log('\n🏥 Genesis Diagnostics Report');
  console.log('=' .repeat(50));

  console.log('\n📊 System:');
  console.log(`  Platform: ${report.system.platform} (${report.system.arch})`);
  console.log(`  Node: ${report.system.nodeVersion}`);
  console.log(`  CPUs: ${report.system.cpuCount}`);
  console.log(`  Memory: ${report.system.freeMemory} free / ${report.system.totalMemory} total`);
  console.log(`  Uptime: ${report.system.uptime}`);

  console.log('\n⚙️ Process:');
  console.log(`  PID: ${report.process.pid}`);
  console.log(`  Heap: ${report.process.memoryUsage.heapUsed} / ${report.process.memoryUsage.heapTotal}`);
  console.log(`  RSS: ${report.process.memoryUsage.rss}`);

  console.log('\n🧬 Genesis:');
  console.log(`  Version: ${report.genesis.version}`);
  console.log(`  Evolutions: ${report.genesis.evolutions}`);
  console.log(`  Capabilities: ${report.genesis.capabilities.join(', ')}`);

  const statusEmoji = {
    healthy: '✅',
    degraded: '⚠️',
    unhealthy: '❌',
  };

  console.log(`\n🏥 Health: ${statusEmoji[report.health.overall]} ${report.health.overall.toUpperCase()}`);
  for (const check of report.health.checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    console.log(`  [${icon}] ${check.name}: ${check.message}`);
  }
}

// Export for CLI usage
export default { generateDiagnostics, printDiagnostics };
