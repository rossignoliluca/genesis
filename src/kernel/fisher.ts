/**
 * Fisher Information Matrix & Natural Gradient
 *
 * For categorical distributions (Genesis beliefs are 5-state categorical),
 * the Fisher Information Matrix is diagonal: G_ij = δ_ij / p_i
 *
 * The natural gradient is: ∇̃F = G⁻¹ ∇F = diag(p) × ∇F
 *
 * This ensures policy updates respect the geometry of the probability simplex,
 * making updates invariant to reparameterization.
 *
 * Reference: Amari (1998) "Natural Gradient Works Efficiently in Learning"
 */

/**
 * Compute Fisher Information Matrix for a categorical distribution.
 * For categorical with probabilities p = [p_1, ..., p_n]:
 *   G_ij = E[∂log p / ∂θ_i × ∂log p / ∂θ_j] = δ_ij / p_i
 *
 * Returns diagonal elements (since Fisher for categorical is diagonal).
 */
export function fisherDiagonal(probs: number[]): number[] {
  return probs.map(p => {
    const safe = Math.max(p, 1e-8); // Avoid division by zero
    return 1.0 / safe;
  });
}

/**
 * Compute full Fisher Information Matrix (for non-diagonal cases).
 * For categorical, this is just diag(1/p_i), but we provide the general form
 * for potential extension to continuous distributions.
 */
export function fisherMatrix(probs: number[]): number[][] {
  const n = probs.length;
  const G: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    G[i][i] = 1.0 / Math.max(probs[i], 1e-8);
  }
  return G;
}

/**
 * Natural gradient step: ∇̃F = G⁻¹ ∇F
 *
 * For categorical Fisher, G⁻¹ = diag(p_i), so:
 *   naturalGrad_i = p_i × euclideanGrad_i
 *
 * This is the key insight: natural gradient on a categorical simplex
 * scales each component by its current probability, preventing
 * large updates to already-small probabilities.
 */
export function naturalGradient(probs: number[], euclideanGradient: number[]): number[] {
  return probs.map((p, i) => p * (euclideanGradient[i] || 0));
}

/**
 * Apply natural gradient update to policy parameters.
 * Ensures result stays on probability simplex (non-negative, sums to 1).
 *
 * @param policy Current policy (probability distribution)
 * @param gradient Euclidean gradient of the objective (e.g., ∇EFE)
 * @param learningRate Step size
 * @returns Updated policy on the simplex
 */
export function naturalGradientStep(
  policy: number[],
  gradient: number[],
  learningRate: number = 0.01
): number[] {
  // Compute natural gradient
  const natGrad = naturalGradient(policy, gradient);

  // Update: θ' = θ - η × G⁻¹ ∇F (minimize F)
  const updated = policy.map((p, i) => p - learningRate * natGrad[i]);

  // Project back to simplex: clip to [ε, 1] and normalize
  const clipped = updated.map(v => Math.max(v, 1e-6));
  const sum = clipped.reduce((s, v) => s + v, 0);
  return clipped.map(v => v / sum);
}

/**
 * Compute the KL divergence D_KL(Q || P) using Fisher metric.
 * For small perturbations δθ: D_KL ≈ 0.5 × δθᵀ G δθ
 *
 * This gives us a local quadratic approximation of divergence,
 * which is what the FEK minimizes at each step.
 */
export function fisherKLApprox(
  probs: number[],
  perturbation: number[]
): number {
  const fisher = fisherDiagonal(probs);
  let kl = 0;
  for (let i = 0; i < probs.length; i++) {
    const delta = perturbation[i] || 0;
    kl += 0.5 * fisher[i] * delta * delta;
  }
  return kl;
}

/**
 * Compute empirical Fisher from a batch of gradient samples.
 * G_emp = (1/N) Σ_n ∇log p(x_n|θ) × ∇log p(x_n|θ)ᵀ
 *
 * For when the analytical Fisher isn't available (non-categorical models).
 */
export function empiricalFisher(gradientSamples: number[][]): number[][] {
  if (gradientSamples.length === 0) return [];
  const dim = gradientSamples[0].length;
  const G: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));

  for (const grad of gradientSamples) {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        G[i][j] += (grad[i] || 0) * (grad[j] || 0);
      }
    }
  }

  const n = gradientSamples.length;
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      G[i][j] /= n;
    }
  }
  return G;
}
