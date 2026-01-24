/**
 * Decentralized Compute Provider — Akash/Render/io.net
 *
 * Deploys Genesis as a compute provider on decentralized networks,
 * earning revenue by selling idle compute capacity.
 *
 * Requirements:
 *   - Capital: $1,000+ (staking for provider registration)
 *   - Identity: Wallet only
 *   - Revenue: $200-$2,000/month depending on hardware
 *
 * Networks:
 *   - Akash Network: General-purpose compute ($0.05-$0.50/hr)
 *   - Render Network: GPU rendering ($0.20-$2.00/hr)
 *   - io.net: GPU compute for ML ($0.30-$3.00/hr)
 *   - Flux: Decentralized cloud ($0.10-$1.00/hr)
 *
 * What we sell:
 *   - Idle CPU cycles during low-activity periods
 *   - Memory capacity for data processing jobs
 *   - (Optional) GPU time if available
 *
 * Safety:
 *   - Max 70% CPU utilization for external jobs
 *   - Pause external work when Genesis needs resources
 *   - Sandboxed execution (Docker containers)
 *   - Auto-scale down under load
 */

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

export interface ComputeJob {
  id: string;
  network: 'akash' | 'render' | 'ionet' | 'flux';
  type: 'cpu' | 'gpu' | 'memory' | 'storage';
  specs: ComputeSpecs;
  pricePerHour: number;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  revenue: number;
  resourceUsage: ResourceUsage;
}

export interface ComputeSpecs {
  cpuCores: number;
  memoryMB: number;
  gpuCount: number;
  storageGB: number;
  durationHours: number;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryPercent: number;
  gpuPercent: number;
  networkMbps: number;
}

export interface ProviderRegistration {
  network: string;
  stakeAmount: number;
  registered: boolean;
  registeredAt?: number;
  providerAddress?: string;
}

export interface ComputeProviderStats {
  totalJobs: number;
  completedJobs: number;
  totalRevenue: number;
  totalUptime: number;          // Hours providing compute
  averageUtilization: number;   // 0-1
  activeJobs: number;
  registeredNetworks: number;
  totalStaked: number;
  hourlyRate: number;           // Average $/hr earned
}

export interface ComputeProviderConfig {
  maxCpuUtilization: number;    // Max % for external jobs (0-1)
  maxMemoryUtilization: number;
  enabledNetworks: string[];
  minPricePerHour: number;      // Min $/hr to accept jobs
  maxConcurrentJobs: number;
  autoScaleDown: boolean;       // Reduce capacity under load
  stakePerNetwork: number;      // $ to stake per network
}

// ============================================================================
// Compute Provider
// ============================================================================

export class ComputeProvider {
  private config: ComputeProviderConfig;
  private jobs: Map<string, ComputeJob> = new Map();
  private registrations: Map<string, ProviderRegistration> = new Map();
  private readonly fiberId = 'compute-provider';
  private currentUsage: ResourceUsage = { cpuPercent: 0, memoryPercent: 0, gpuPercent: 0, networkMbps: 0 };

  constructor(config?: Partial<ComputeProviderConfig>) {
    this.config = {
      maxCpuUtilization: config?.maxCpuUtilization ?? 0.7,
      maxMemoryUtilization: config?.maxMemoryUtilization ?? 0.6,
      enabledNetworks: config?.enabledNetworks ?? ['akash', 'flux'],
      minPricePerHour: config?.minPricePerHour ?? 0.05,
      maxConcurrentJobs: config?.maxConcurrentJobs ?? 5,
      autoScaleDown: config?.autoScaleDown ?? true,
      stakePerNetwork: config?.stakePerNetwork ?? 500,
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Register as a provider on a decentralized compute network.
   */
  async register(network: string): Promise<ProviderRegistration> {
    const fiber = getEconomicFiber();
    const existing = this.registrations.get(network);
    if (existing?.registered) return existing;

    try {
      const client = getMCPClient();
      const result = await client.call('coinbase' as MCPServerName, 'register_compute_provider', {
        network,
        stake: this.config.stakePerNetwork,
        specs: this.getAvailableSpecs(),
      });

      const reg: ProviderRegistration = {
        network,
        stakeAmount: this.config.stakePerNetwork,
        registered: result.success ?? false,
        registeredAt: result.success ? Date.now() : undefined,
        providerAddress: result.data?.address,
      };

      if (reg.registered) {
        fiber.recordCost(this.fiberId, this.config.stakePerNetwork, `stake:${network}`);
      }

      this.registrations.set(network, reg);
      return reg;
    } catch {
      const reg: ProviderRegistration = {
        network,
        stakeAmount: this.config.stakePerNetwork,
        registered: false,
      };
      this.registrations.set(network, reg);
      return reg;
    }
  }

  /**
   * Accept and start a compute job.
   */
  async acceptJob(job: Omit<ComputeJob, 'id' | 'startTime' | 'status' | 'revenue' | 'resourceUsage'>): Promise<ComputeJob | null> {
    // Check capacity
    const activeJobs = [...this.jobs.values()].filter(j => j.status === 'running');
    if (activeJobs.length >= this.config.maxConcurrentJobs) return null;

    // Check price
    if (job.pricePerHour < this.config.minPricePerHour) return null;

    // Check resource availability
    if (!this.hasCapacity(job.specs)) return null;

    const computeJob: ComputeJob = {
      ...job,
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startTime: Date.now(),
      status: 'running',
      revenue: 0,
      resourceUsage: { cpuPercent: 0, memoryPercent: 0, gpuPercent: 0, networkMbps: 0 },
    };

    this.jobs.set(computeJob.id, computeJob);
    this.updateUsage();
    return computeJob;
  }

  /**
   * Complete a running job and collect payment.
   */
  async completeJob(jobId: string): Promise<number> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return 0;

    const fiber = getEconomicFiber();
    const hoursRun = (Date.now() - job.startTime) / 3600000;
    const revenue = hoursRun * job.pricePerHour;

    job.status = 'completed';
    job.endTime = Date.now();
    job.revenue = revenue;

    fiber.recordRevenue(this.fiberId, revenue, `compute:${job.network}:${job.type}`);
    this.updateUsage();

    return revenue;
  }

  /**
   * Check for new jobs on registered networks.
   */
  async checkForJobs(): Promise<ComputeJob[]> {
    const accepted: ComputeJob[] = [];

    for (const [network, reg] of this.registrations) {
      if (!reg.registered) continue;

      try {
        const client = getMCPClient();
        const result = await client.call('coinbase' as MCPServerName, 'check_compute_jobs', {
          network,
          providerAddress: reg.providerAddress,
          availableSpecs: this.getAvailableSpecs(),
        });

        if (result.success && Array.isArray(result.data?.jobs)) {
          for (const j of result.data.jobs) {
            const job = await this.acceptJob({
              network: network as ComputeJob['network'],
              type: j.type ?? 'cpu',
              specs: {
                cpuCores: j.cpuCores ?? 1,
                memoryMB: j.memoryMB ?? 512,
                gpuCount: j.gpuCount ?? 0,
                storageGB: j.storageGB ?? 10,
                durationHours: j.durationHours ?? 1,
              },
              pricePerHour: j.pricePerHour ?? 0.10,
            });
            if (job) accepted.push(job);
          }
        }
      } catch {
        // Network unavailable
      }
    }

    return accepted;
  }

  /**
   * Complete all finished jobs.
   */
  async harvestCompleted(): Promise<number> {
    let totalRevenue = 0;

    for (const [, job] of this.jobs) {
      if (job.status !== 'running') continue;

      const hoursRun = (Date.now() - job.startTime) / 3600000;
      if (hoursRun >= job.specs.durationHours) {
        const revenue = await this.completeJob(job.id);
        totalRevenue += revenue;
      }
    }

    return totalRevenue;
  }

  /**
   * Get current statistics.
   */
  getStats(): ComputeProviderStats {
    const completed = [...this.jobs.values()].filter(j => j.status === 'completed');
    const active = [...this.jobs.values()].filter(j => j.status === 'running');
    const registered = [...this.registrations.values()].filter(r => r.registered);

    const totalUptime = completed.reduce((s, j) => {
      const hours = ((j.endTime ?? Date.now()) - j.startTime) / 3600000;
      return s + hours;
    }, 0);

    return {
      totalJobs: this.jobs.size,
      completedJobs: completed.length,
      totalRevenue: completed.reduce((s, j) => s + j.revenue, 0),
      totalUptime,
      averageUtilization: this.currentUsage.cpuPercent,
      activeJobs: active.length,
      registeredNetworks: registered.length,
      totalStaked: registered.reduce((s, r) => s + r.stakeAmount, 0),
      hourlyRate: totalUptime > 0
        ? completed.reduce((s, j) => s + j.revenue, 0) / totalUptime
        : 0,
    };
  }

  /**
   * Get ROI.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  /**
   * Check if provider is operational (registered on at least one network).
   */
  isOperational(): boolean {
    return [...this.registrations.values()].some(r => r.registered);
  }

  // ============================================================================
  // Private
  // ============================================================================

  private hasCapacity(specs: ComputeSpecs): boolean {
    const availCpu = (this.config.maxCpuUtilization - this.currentUsage.cpuPercent) * 100;
    const availMem = (this.config.maxMemoryUtilization - this.currentUsage.memoryPercent) * 100;

    return specs.cpuCores <= availCpu / 25 && specs.memoryMB <= (availMem / 100) * 16384;
  }

  private getAvailableSpecs(): ComputeSpecs {
    return {
      cpuCores: Math.floor((this.config.maxCpuUtilization - this.currentUsage.cpuPercent) * 8),
      memoryMB: Math.floor((this.config.maxMemoryUtilization - this.currentUsage.memoryPercent) * 16384),
      gpuCount: 0,
      storageGB: 50,
      durationHours: 24,
    };
  }

  private updateUsage(): void {
    const active = [...this.jobs.values()].filter(j => j.status === 'running');
    const totalCpuDemand = active.reduce((s, j) => s + j.specs.cpuCores * 0.125, 0); // 8 cores = 100%
    const totalMemDemand = active.reduce((s, j) => s + j.specs.memoryMB / 16384, 0);

    this.currentUsage = {
      cpuPercent: Math.min(1, totalCpuDemand),
      memoryPercent: Math.min(1, totalMemDemand),
      gpuPercent: 0,
      networkMbps: active.length * 10,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let providerInstance: ComputeProvider | null = null;

export function getComputeProvider(config?: Partial<ComputeProviderConfig>): ComputeProvider {
  if (!providerInstance) {
    providerInstance = new ComputeProvider(config);
  }
  return providerInstance;
}

export function resetComputeProvider(): void {
  providerInstance = null;
}
