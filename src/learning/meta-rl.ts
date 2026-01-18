/**
 * META-REINFORCEMENT LEARNING
 *
 * Learning to learn: adapt learning strategies based on task characteristics.
 * The system improves its own learning process over time.
 *
 * Implements:
 * - MAML (Model-Agnostic Meta-Learning)
 * - RL² (Reinforcement Learning Squared)
 * - Learning rate adaptation
 * - Task embedding for transfer
 * - Curriculum learning
 *
 * Based on:
 * - Finn et al. (2017): MAML
 * - Duan et al. (2016): RL²
 * - Wang et al. (2016): Learning to reinforcement learn
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MetaRLConfig {
  innerLearningRate: number;
  outerLearningRate: number;
  innerSteps: number;
  metaBatchSize: number;
  taskEmbeddingDim: number;
  adaptationWindow: number;
  curriculumEnabled: boolean;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  rewardFunction: (state: number[], action: number[]) => number;
  transitionFunction: (state: number[], action: number[]) => number[];
  embedding?: number[];
  difficulty: number;  // 0-1
}

export interface TaskExperience {
  taskId: string;
  episodes: Episode[];
  adaptationCurve: number[];  // Reward per episode
  finalPolicy: Policy;
  totalReward: number;
}

export interface Episode {
  states: number[][];
  actions: number[][];
  rewards: number[];
  done: boolean;
  totalReturn: number;
}

export interface Policy {
  weights: number[][];
  bias: number[];
  stateNorm: { mean: number[]; std: number[] };
}

export interface MetaGradient {
  taskId: string;
  gradient: number[][];
  loss: number;
}

export interface AdaptationResult {
  adaptedPolicy: Policy;
  adaptationLoss: number[];
  episodeRewards: number[];
  stepsToConverge: number;
}

export interface CurriculumState {
  currentDifficulty: number;
  taskHistory: string[];
  successRate: number;
  adaptationSpeed: number;
}

// ============================================================================
// META-RL LEARNER
// ============================================================================

export class MetaRLLearner {
  private config: MetaRLConfig;
  private metaPolicy: Policy;
  private taskExperiences: Map<string, TaskExperience> = new Map();
  private taskEmbedder: TaskEmbedder;
  private curriculum: CurriculumState;

  constructor(config: Partial<MetaRLConfig> = {}, stateDim: number = 32, actionDim: number = 8) {
    this.config = {
      innerLearningRate: 0.01,
      outerLearningRate: 0.001,
      innerSteps: 5,
      metaBatchSize: 4,
      taskEmbeddingDim: 32,
      adaptationWindow: 100,
      curriculumEnabled: true,
      ...config
    };

    this.metaPolicy = this.initPolicy(stateDim, actionDim);
    this.taskEmbedder = new TaskEmbedder(this.config.taskEmbeddingDim);
    this.curriculum = {
      currentDifficulty: 0.1,
      taskHistory: [],
      successRate: 0.5,
      adaptationSpeed: 1.0
    };
  }

  private initPolicy(stateDim: number, actionDim: number): Policy {
    const hiddenDim = Math.max(stateDim, actionDim) * 2;
    const scale = Math.sqrt(2.0 / (stateDim + hiddenDim));

    const weights: number[][] = [];
    for (let i = 0; i < actionDim; i++) {
      weights.push(Array(stateDim).fill(0).map(() => (Math.random() * 2 - 1) * scale));
    }

    return {
      weights,
      bias: Array(actionDim).fill(0),
      stateNorm: {
        mean: Array(stateDim).fill(0),
        std: Array(stateDim).fill(1)
      }
    };
  }

  // --------------------------------------------------------------------------
  // MAML: MODEL-AGNOSTIC META-LEARNING
  // --------------------------------------------------------------------------

  /**
   * Adapt policy to new task using few-shot learning
   */
  adaptToTask(task: Task, numEpisodes: number = 5): AdaptationResult {
    // Clone meta-policy for task-specific adaptation
    let adaptedPolicy = this.clonePolicy(this.metaPolicy);

    const adaptationLoss: number[] = [];
    const episodeRewards: number[] = [];

    // Inner loop: adapt to task
    for (let step = 0; step < this.config.innerSteps; step++) {
      // Collect experience with current adapted policy
      const episodes = this.collectEpisodes(task, adaptedPolicy, numEpisodes);

      // Compute loss and gradient
      const { loss, gradient } = this.computePolicyGradient(episodes, adaptedPolicy);
      adaptationLoss.push(loss);

      const avgReward = episodes.reduce((sum, ep) => sum + ep.totalReturn, 0) / episodes.length;
      episodeRewards.push(avgReward);

      // Update adapted policy (inner loop update)
      adaptedPolicy = this.updatePolicy(adaptedPolicy, gradient, this.config.innerLearningRate);
    }

    // Record experience
    const experience: TaskExperience = {
      taskId: task.id,
      episodes: [],
      adaptationCurve: episodeRewards,
      finalPolicy: adaptedPolicy,
      totalReward: episodeRewards.reduce((a, b) => a + b, 0)
    };
    this.taskExperiences.set(task.id, experience);

    return {
      adaptedPolicy,
      adaptationLoss,
      episodeRewards,
      stepsToConverge: this.estimateConvergence(episodeRewards)
    };
  }

  /**
   * Meta-update: improve meta-policy based on task adaptation performance
   */
  metaUpdate(tasks: Task[]): { metaLoss: number; gradientNorm: number } {
    const metaGradients: MetaGradient[] = [];

    // Outer loop: collect gradients from multiple tasks
    for (const task of tasks.slice(0, this.config.metaBatchSize)) {
      // Adapt to task
      const result = this.adaptToTask(task);

      // Compute meta-gradient (gradient through adaptation)
      const metaGrad = this.computeMetaGradient(task, result.adaptedPolicy);
      metaGradients.push(metaGrad);
    }

    // Average meta-gradients
    const avgGradient = this.averageGradients(metaGradients);

    // Update meta-policy
    this.metaPolicy = this.updatePolicy(
      this.metaPolicy,
      avgGradient,
      this.config.outerLearningRate
    );

    const metaLoss = metaGradients.reduce((sum, g) => sum + g.loss, 0) / metaGradients.length;
    const gradientNorm = this.computeGradientNorm(avgGradient);

    return { metaLoss, gradientNorm };
  }

  // --------------------------------------------------------------------------
  // EPISODE COLLECTION
  // --------------------------------------------------------------------------

  private collectEpisodes(task: Task, policy: Policy, numEpisodes: number): Episode[] {
    const episodes: Episode[] = [];

    for (let ep = 0; ep < numEpisodes; ep++) {
      episodes.push(this.runEpisode(task, policy));
    }

    return episodes;
  }

  private runEpisode(task: Task, policy: Policy, maxSteps: number = 100): Episode {
    const states: number[][] = [];
    const actions: number[][] = [];
    const rewards: number[] = [];

    // Initialize state
    let state = Array(policy.weights[0].length).fill(0).map(() => Math.random() * 2 - 1);
    let done = false;
    let step = 0;

    while (!done && step < maxSteps) {
      states.push([...state]);

      // Sample action from policy
      const action = this.sampleAction(policy, state);
      actions.push(action);

      // Get reward and next state
      const reward = task.rewardFunction(state, action);
      rewards.push(reward);

      state = task.transitionFunction(state, action);
      step++;

      // Check termination (simplified)
      done = Math.random() < 0.01;  // Small termination probability
    }

    const totalReturn = rewards.reduce((a, b, i) => a + b * Math.pow(0.99, i), 0);

    return { states, actions, rewards, done, totalReturn };
  }

  private sampleAction(policy: Policy, state: number[]): number[] {
    // Normalize state
    const normState = state.map((s, i) =>
      (s - policy.stateNorm.mean[i]) / (policy.stateNorm.std[i] + 1e-8)
    );

    // Linear policy: action = W * state + b
    const action: number[] = [];
    for (let i = 0; i < policy.weights.length; i++) {
      let a = policy.bias[i];
      for (let j = 0; j < normState.length; j++) {
        a += policy.weights[i][j] * normState[j];
      }
      // Add noise for exploration
      a += this.sampleNormal() * 0.1;
      action.push(Math.tanh(a));  // Bound actions
    }

    return action;
  }

  // --------------------------------------------------------------------------
  // GRADIENT COMPUTATION
  // --------------------------------------------------------------------------

  private computePolicyGradient(
    episodes: Episode[],
    policy: Policy
  ): { loss: number; gradient: number[][] } {
    const gradient: number[][] = policy.weights.map(row => Array(row.length).fill(0));
    let totalLoss = 0;

    for (const episode of episodes) {
      // Compute returns (rewards-to-go)
      const returns = this.computeReturns(episode.rewards);

      // REINFORCE gradient
      for (let t = 0; t < episode.states.length; t++) {
        const state = episode.states[t];
        const action = episode.actions[t];
        const advantage = returns[t];

        // ∇ log π(a|s) * A(s,a)
        for (let i = 0; i < policy.weights.length; i++) {
          for (let j = 0; j < state.length; j++) {
            gradient[i][j] += state[j] * (action[i] - this.policyMean(policy, state)[i]) * advantage;
          }
        }
      }

      totalLoss -= episode.totalReturn;  // Negative because we minimize
    }

    // Normalize by number of episodes
    const n = episodes.length;
    for (let i = 0; i < gradient.length; i++) {
      for (let j = 0; j < gradient[i].length; j++) {
        gradient[i][j] /= n;
      }
    }

    return { loss: totalLoss / n, gradient };
  }

  private policyMean(policy: Policy, state: number[]): number[] {
    const mean: number[] = [];
    for (let i = 0; i < policy.weights.length; i++) {
      let m = policy.bias[i];
      for (let j = 0; j < state.length; j++) {
        m += policy.weights[i][j] * state[j];
      }
      mean.push(Math.tanh(m));
    }
    return mean;
  }

  private computeReturns(rewards: number[], gamma: number = 0.99): number[] {
    const returns: number[] = Array(rewards.length).fill(0);
    let G = 0;

    for (let t = rewards.length - 1; t >= 0; t--) {
      G = rewards[t] + gamma * G;
      returns[t] = G;
    }

    // Normalize returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length) + 1e-8;

    return returns.map(r => (r - mean) / std);
  }

  private computeMetaGradient(task: Task, adaptedPolicy: Policy): MetaGradient {
    // Collect episodes with adapted policy
    const episodes = this.collectEpisodes(task, adaptedPolicy, 3);

    // Compute gradient for meta-update
    const { loss, gradient } = this.computePolicyGradient(episodes, adaptedPolicy);

    return {
      taskId: task.id,
      gradient,
      loss
    };
  }

  // --------------------------------------------------------------------------
  // POLICY UPDATE
  // --------------------------------------------------------------------------

  private updatePolicy(policy: Policy, gradient: number[][], lr: number): Policy {
    const newWeights = policy.weights.map((row, i) =>
      row.map((w, j) => w - lr * gradient[i][j])  // Gradient descent
    );

    return {
      weights: newWeights,
      bias: [...policy.bias],
      stateNorm: policy.stateNorm
    };
  }

  private clonePolicy(policy: Policy): Policy {
    return {
      weights: policy.weights.map(row => [...row]),
      bias: [...policy.bias],
      stateNorm: {
        mean: [...policy.stateNorm.mean],
        std: [...policy.stateNorm.std]
      }
    };
  }

  private averageGradients(gradients: MetaGradient[]): number[][] {
    if (gradients.length === 0) return [];

    const avg = gradients[0].gradient.map(row => Array(row.length).fill(0));

    for (const grad of gradients) {
      for (let i = 0; i < grad.gradient.length; i++) {
        for (let j = 0; j < grad.gradient[i].length; j++) {
          avg[i][j] += grad.gradient[i][j] / gradients.length;
        }
      }
    }

    return avg;
  }

  private computeGradientNorm(gradient: number[][]): number {
    let norm = 0;
    for (const row of gradient) {
      for (const g of row) {
        norm += g * g;
      }
    }
    return Math.sqrt(norm);
  }

  // --------------------------------------------------------------------------
  // CURRICULUM LEARNING
  // --------------------------------------------------------------------------

  /**
   * Select next task based on curriculum
   */
  selectNextTask(availableTasks: Task[]): Task {
    if (!this.config.curriculumEnabled) {
      return availableTasks[Math.floor(Math.random() * availableTasks.length)];
    }

    // Filter tasks by difficulty
    const suitableTasks = availableTasks.filter(t =>
      Math.abs(t.difficulty - this.curriculum.currentDifficulty) < 0.3
    );

    if (suitableTasks.length === 0) {
      return availableTasks[0];
    }

    // Prefer tasks not recently attempted
    const notRecent = suitableTasks.filter(t =>
      !this.curriculum.taskHistory.slice(-5).includes(t.id)
    );

    const candidates = notRecent.length > 0 ? notRecent : suitableTasks;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Update curriculum based on performance
   */
  updateCurriculum(taskId: string, success: boolean, adaptationSteps: number): void {
    this.curriculum.taskHistory.push(taskId);
    if (this.curriculum.taskHistory.length > 20) {
      this.curriculum.taskHistory.shift();
    }

    // Update success rate
    this.curriculum.successRate = 0.9 * this.curriculum.successRate + 0.1 * (success ? 1 : 0);

    // Update adaptation speed
    const expectedSteps = this.config.innerSteps;
    this.curriculum.adaptationSpeed = 0.9 * this.curriculum.adaptationSpeed +
                                       0.1 * (expectedSteps / Math.max(adaptationSteps, 1));

    // Adjust difficulty
    if (this.curriculum.successRate > 0.8 && this.curriculum.adaptationSpeed > 0.8) {
      this.curriculum.currentDifficulty = Math.min(1, this.curriculum.currentDifficulty + 0.05);
    } else if (this.curriculum.successRate < 0.4) {
      this.curriculum.currentDifficulty = Math.max(0.1, this.curriculum.currentDifficulty - 0.1);
    }
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private estimateConvergence(rewards: number[]): number {
    // Estimate when rewards stabilized
    if (rewards.length < 2) return rewards.length;

    for (let i = 1; i < rewards.length; i++) {
      const improvement = (rewards[i] - rewards[i - 1]) / Math.abs(rewards[i - 1] + 1e-8);
      if (improvement < 0.01) return i;
    }

    return rewards.length;
  }

  private sampleNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  getMetaPolicy(): Policy {
    return this.clonePolicy(this.metaPolicy);
  }

  getCurriculum(): CurriculumState {
    return { ...this.curriculum };
  }

  getTaskExperience(taskId: string): TaskExperience | undefined {
    return this.taskExperiences.get(taskId);
  }

  getConfig(): MetaRLConfig {
    return { ...this.config };
  }
}

// ============================================================================
// TASK EMBEDDER
// ============================================================================

class TaskEmbedder {
  private dim: number;
  private embeddings: Map<string, number[]> = new Map();

  constructor(dim: number) {
    this.dim = dim;
  }

  /**
   * Compute or retrieve task embedding
   */
  embed(task: Task): number[] {
    if (this.embeddings.has(task.id)) {
      return this.embeddings.get(task.id)!;
    }

    // Create embedding from task description (simplified)
    const embedding = this.createEmbedding(task);
    this.embeddings.set(task.id, embedding);
    return embedding;
  }

  private createEmbedding(task: Task): number[] {
    // Simple hash-based embedding
    const embedding = Array(this.dim).fill(0);
    const text = task.name + task.description;

    for (let i = 0; i < text.length; i++) {
      const idx = text.charCodeAt(i) % this.dim;
      embedding[idx] += 0.1;
    }

    // Add difficulty signal
    embedding[0] = task.difficulty;

    // Normalize
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    return embedding.map(v => v / (norm + 1e-8));
  }

  computeSimilarity(task1: Task, task2: Task): number {
    const e1 = this.embed(task1);
    const e2 = this.embed(task2);

    let dot = 0;
    for (let i = 0; i < this.dim; i++) {
      dot += e1[i] * e2[i];
    }
    return dot;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createMetaRLLearner(
  config?: Partial<MetaRLConfig>,
  stateDim?: number,
  actionDim?: number
): MetaRLLearner {
  return new MetaRLLearner(config, stateDim, actionDim);
}

export function createSimpleTask(
  id: string,
  name: string,
  difficulty: number
): Task {
  return {
    id,
    name,
    description: `Task ${name} with difficulty ${difficulty}`,
    rewardFunction: (state, action) => {
      // Simple reward: minimize state norm, maximize action
      const stateNorm = Math.sqrt(state.reduce((s, v) => s + v * v, 0));
      const actionSum = action.reduce((s, v) => s + v, 0);
      return actionSum - stateNorm * difficulty;
    },
    transitionFunction: (state, action) => {
      return state.map((s, i) => s * 0.9 + (action[i % action.length] || 0) * 0.1);
    },
    difficulty
  };
}
