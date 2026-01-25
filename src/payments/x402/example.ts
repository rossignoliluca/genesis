/**
 * x402 Payment Protocol - Usage Examples
 *
 * Demonstrates how to use the x402 payment protocol for both
 * paying for resources (client) and receiving payments (server).
 *
 * Run with: npx tsx src/payments/x402/example.ts
 */

import { getLiveWallet } from '../../economy/live/wallet.js';
import {
  createClient,
  createServer,
  createDemandSignal,
  formatPrice,
} from './index.js';
import { parseUnits } from 'viem';
import type { X402Challenge, X402PaymentProof } from './types.js';

// ============================================================================
// Example 1: Client - Paying for a Resource
// ============================================================================

async function exampleClient() {
  console.log('\n=== Example 1: Client (Payer) ===\n');

  try {
    const wallet = getLiveWallet();
    console.log(`Wallet address: ${wallet.getAddress()}`);

    // Create client with budget controls
    const client = createClient(wallet, {
      autoPayEnabled: false, // Manual approval for demo
      maxAutoPayAmount: parseUnits('1.00', 6),
      dailyBudget: parseUnits('10.00', 6),
      budgetTracking: true,
    });

    console.log('Client configured:', client.getConfig());

    // Simulate receiving a challenge from a resource provider
    const challenge: X402Challenge = {
      challengeId: `chal-${Date.now()}`,
      resourceUri: 'https://api.example.com/expensive-computation',
      paymentAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Example address
      amount: parseUnits('0.05', 6), // $0.05 USDC
      currency: 'USDC',
      network: wallet.getChainId() === 8453 ? 'base' : 'base-sepolia',
      expiresAt: new Date(Date.now() + 300000).toISOString(), // 5 minutes
      nonce: `nonce-${Date.now()}-${Math.random()}`,
      metadata: {
        resourceType: 'compute.heavy',
        estimatedCost: 0.05,
      },
    };

    console.log('\nReceived payment challenge:');
    console.log(`- Resource: ${challenge.resourceUri}`);
    console.log(`- Amount: ${formatPrice(challenge.amount)}`);
    console.log(`- Expires: ${challenge.expiresAt}`);

    // Check current spending
    const statsBefore = client.getSpendingStats();
    console.log('\nBudget before payment:');
    console.log(`- Daily spent: $${statsBefore.dailySpent} USDC`);
    console.log(`- Budget used: ${statsBefore.percentUsed.toFixed(1)}%`);
    console.log(`- Remaining: $${statsBefore.remaining} USDC`);

    // NOTE: Actual payment commented out to prevent real transactions
    // Uncomment to test with real wallet
    /*
    console.log('\nSubmitting payment...');
    const result = await client.pay(challenge);

    if (result.success) {
      console.log('\n✓ Payment successful!');
      console.log(`- Receipt ID: ${result.receipt?.receiptId}`);
      console.log(`- TX Hash: ${result.txHash}`);
      console.log(`- Access Token: ${result.receipt?.accessToken}`);

      // Check spending after payment
      const statsAfter = client.getSpendingStats();
      console.log('\nBudget after payment:');
      console.log(`- Daily spent: $${statsAfter.dailySpent} USDC`);
      console.log(`- Budget used: ${statsAfter.percentUsed.toFixed(1)}%`);
    } else {
      console.error('\n✗ Payment failed:', result.error?.message);
    }
    */

    console.log('\n(Payment simulation - uncomment to test with real wallet)');
  } catch (error) {
    console.error('Client example error:', error);
  }
}

// ============================================================================
// Example 2: Server - Receiving Payments
// ============================================================================

async function exampleServer() {
  console.log('\n=== Example 2: Server (Facilitator) ===\n');

  try {
    const wallet = getLiveWallet();
    const paymentAddress = wallet.getAddress();

    console.log(`Payment address: ${paymentAddress}`);

    // Create server with dynamic pricing
    const server = createServer(paymentAddress, {
      network: wallet.getChainId() === 8453 ? 'base' : 'base-sepolia',
      pricing: {
        basePrices: {
          'api.call': parseUnits('0.01', 6),
          'compute.light': parseUnits('0.05', 6),
          'compute.heavy': parseUnits('0.25', 6),
        },
        dynamicPricing: true,
        minPrice: parseUnits('0.001', 6),
        maxPrice: parseUnits('10.00', 6),
        elasticity: 1.5,
        costFactors: {
          compute: 0.0001,
          bandwidth: 0.00001,
          storage: 0.000001,
        },
      },
      challengeExpirySeconds: 300,
      requiredConfirmations: 1,
      autoVerify: true,
    });

    console.log('Server configured:', server.getConfig());

    // Simulate normal demand
    console.log('\n--- Scenario 1: Normal Demand ---');
    const normalDemand = createDemandSignal('compute.heavy', {
      requestRate: 10,
      averageRate: 10,
      utilization: 50,
      queueDepth: 5,
    });

    server.updateDemand(normalDemand);
    const normalPrice = server.getPrice('compute.heavy');

    console.log('Demand metrics:', normalDemand);
    console.log(`Price: ${formatPrice(normalPrice.finalPrice)}`);
    console.log(`Demand multiplier: ${normalPrice.demandMultiplier.toFixed(2)}x`);

    // Issue challenge
    const challenge1 = server.issueChallenge(
      'https://api.example.com/compute',
      'compute.heavy',
      'USDC',
    );

    console.log('\nChallenge issued:');
    console.log(`- Challenge ID: ${challenge1.challengeId}`);
    console.log(`- Amount: ${formatPrice(challenge1.amount)}`);
    console.log(`- Nonce: ${challenge1.nonce}`);

    // Simulate high demand
    console.log('\n--- Scenario 2: High Demand ---');
    const highDemand = createDemandSignal('compute.heavy', {
      requestRate: 50,
      averageRate: 10,
      utilization: 90,
      queueDepth: 50,
    });

    server.updateDemand(highDemand);
    const highPrice = server.getPrice('compute.heavy');

    console.log('Demand metrics:', highDemand);
    console.log(`Price: ${formatPrice(highPrice.finalPrice)}`);
    console.log(`Demand multiplier: ${highPrice.demandMultiplier.toFixed(2)}x`);

    const challenge2 = server.issueChallenge(
      'https://api.example.com/compute',
      'compute.heavy',
      'USDC',
    );

    console.log('\nChallenge issued:');
    console.log(`- Amount: ${formatPrice(challenge2.amount)}`);
    console.log(
      `- Price increase: ${((Number(challenge2.amount) / Number(challenge1.amount) - 1) * 100).toFixed(1)}%`,
    );

    // Simulate payment verification
    console.log('\n--- Payment Verification (Simulated) ---');

    // NOTE: This is a simulated proof - real proof would come from actual transaction
    const simulatedProof: X402PaymentProof = {
      challengeId: challenge1.challengeId,
      txHash: `0x${'a'.repeat(64)}`, // Fake transaction hash
      fromAddress: '0x' + '1'.repeat(40), // Fake sender
      toAddress: paymentAddress,
      amount: challenge1.amount,
      currency: 'USDC',
      network: challenge1.network,
      blockNumber: 1000000n,
      timestamp: new Date().toISOString(),
    };

    console.log('Payment proof received:');
    console.log(`- TX Hash: ${simulatedProof.txHash}`);
    console.log(`- From: ${simulatedProof.fromAddress}`);
    console.log(`- Amount: ${formatPrice(simulatedProof.amount)}`);

    // NOTE: Actual verification commented out (requires real on-chain transaction)
    /*
    try {
      const receipt = await server.verifyPayment(simulatedProof);
      console.log('\n✓ Payment verified!');
      console.log(`- Receipt ID: ${receipt.receiptId}`);
      console.log(`- Access Token: ${receipt.accessToken}`);
      console.log(`- Expires: ${receipt.expiresAt}`);
    } catch (error) {
      console.error('\n✗ Verification failed:', error);
    }
    */

    console.log('\n(Verification simulation - requires real on-chain transaction)');

    // Revenue stats
    const stats = await server.getRevenueStats();
    console.log('\nRevenue statistics:');
    console.log(`- Total receipts: ${stats.totalReceipts}`);
    console.log(`- Total revenue: ${formatPrice(stats.totalRevenue)}`);

    // Cleanup
    const cleaned = server.cleanupChallenges();
    console.log(`\nCleaned up ${cleaned} expired challenges`);
  } catch (error) {
    console.error('Server example error:', error);
  }
}

// ============================================================================
// Example 3: Dynamic Pricing Demonstration
// ============================================================================

async function examplePricing() {
  console.log('\n=== Example 3: Dynamic Pricing ===\n');

  try {
    const wallet = getLiveWallet();
    const server = createServer(wallet.getAddress());

    console.log('Testing price changes with different demand levels:\n');

    const resourceType = 'api.call';
    const demandLevels = [
      { name: 'Very Low', utilization: 10, requestRate: 1, averageRate: 10 },
      { name: 'Low', utilization: 30, requestRate: 5, averageRate: 10 },
      { name: 'Normal', utilization: 50, requestRate: 10, averageRate: 10 },
      { name: 'High', utilization: 70, requestRate: 20, averageRate: 10 },
      { name: 'Very High', utilization: 90, requestRate: 50, averageRate: 10 },
    ];

    const results = [];

    for (const level of demandLevels) {
      const demand = createDemandSignal(resourceType, {
        ...level,
        queueDepth: Math.floor(level.requestRate / 2),
      });

      server.updateDemand(demand);
      const price = server.getPrice(resourceType);

      results.push({
        demand: level.name,
        utilization: level.utilization,
        multiplier: price.demandMultiplier.toFixed(2),
        price: formatPrice(price.finalPrice),
      });
    }

    console.table(results);

    console.log('\nPricing demonstrates:');
    console.log('- Prices increase smoothly with demand');
    console.log('- Sigmoid function prevents extreme price spikes');
    console.log('- Elasticity controls price sensitivity');
  } catch (error) {
    console.error('Pricing example error:', error);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     x402 Payment Protocol - Usage Examples            ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    // Check wallet configuration
    const wallet = getLiveWallet();
    const balances = await wallet.getBalances();

    console.log('\nWallet Status:');
    console.log(`- Address: ${wallet.getAddress()}`);
    console.log(`- Network: ${wallet.getChainId() === 8453 ? 'Base Mainnet' : 'Base Sepolia'}`);
    console.log(`- ETH Balance: ${balances.ethFormatted} ETH`);
    console.log(`- USDC Balance: ${balances.usdcFormatted} USDC`);

    // Run examples
    await exampleClient();
    await exampleServer();
    await examplePricing();

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║     Examples completed successfully                    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n✗ Example failed:', error);
    process.exit(1);
  }
}

// Run: npx tsx src/payments/x402/example.ts
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch(console.error);
// }

export { exampleClient, exampleServer, examplePricing };
