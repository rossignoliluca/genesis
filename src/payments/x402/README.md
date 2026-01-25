# x402 Payment Protocol Integration

Complete implementation of the HTTP 402 Payment Required protocol for AI agent micropayments on Base L2.

## Overview

The x402 protocol enables AI agents to pay for resources on the open internet using USDC micropayments. This implementation provides both client (payer) and server (facilitator) functionality, with on-chain payment verification and dynamic pricing.

## Architecture

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Server    │
│  (Payer)    │                    │(Facilitator)│
└─────────────┘                    └─────────────┘
      │                                    │
      │  1. Request Resource               │
      │───────────────────────────────────>│
      │                                    │
      │  2. HTTP 402 + Challenge           │
      │<───────────────────────────────────│
      │                                    │
      │  3. USDC Payment (Base L2)         │
      │────────────────────────────────────>
      │                                    │
      │  4. Submit Payment Proof           │
      │───────────────────────────────────>│
      │                                    │
      │     (On-chain Verification)        │
      │                                    │
      │  5. Receipt + Access Token         │
      │<───────────────────────────────────│
      │                                    │
      │  6. Access Resource                │
      │───────────────────────────────────>│
```

## Components

### 1. Types (`types.ts`)
Protocol type definitions:
- `X402Challenge` - Payment challenge from server
- `X402PaymentProof` - On-chain payment proof
- `X402Receipt` - Payment verification receipt
- `X402Session` - Payment session tracking
- Event bus integration types

### 2. Client (`client.ts`)
Payer-side implementation:
- Pay for resources with USDC
- Budget tracking and limits
- Session management
- Event bus integration

### 3. Server (`server.ts`)
Facilitator-side implementation:
- Issue payment challenges
- Verify payment proofs
- Revenue tracking
- Demand-based pricing

### 4. Verification (`verification.ts`)
On-chain payment verification:
- Transaction existence checks
- Amount verification
- Address verification
- Confirmation requirements

### 5. Pricing (`pricing.ts`)
Dynamic pricing engine:
- Base pricing by resource type
- Demand-based multipliers
- Cost estimation (compute, bandwidth, storage)
- Price prediction

## Usage

### As Payer (Client)

```typescript
import { setupClient } from './payments/x402';
import { getLiveWallet } from './economy/live/wallet';

// Setup client with wallet
const wallet = getLiveWallet();
const client = setupClient({
  autoPayEnabled: true,
  maxAutoPayAmount: parseUnits('1.00', 6), // $1 max
  dailyBudget: parseUnits('10.00', 6), // $10 daily
});

// Receive challenge from resource provider
const challenge: X402Challenge = {
  challengeId: 'chal-123',
  resourceUri: 'https://api.example.com/data',
  paymentAddress: '0x...',
  amount: parseUnits('0.10', 6), // $0.10 USDC
  currency: 'USDC',
  network: 'base',
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  nonce: 'unique-nonce',
};

// Pay for resource
const result = await client.pay(challenge);

if (result.success) {
  console.log('Payment successful!');
  console.log('Receipt:', result.receipt);
  console.log('Access token:', result.receipt?.accessToken);

  // Use access token to fetch resource
  const response = await fetch(challenge.resourceUri, {
    headers: {
      'Authorization': `Bearer ${result.receipt?.accessToken}`,
    },
  });
}

// Check spending
const stats = client.getSpendingStats();
console.log('Daily spent:', stats.dailySpent, 'USDC');
console.log('Budget used:', stats.percentUsed, '%');
```

### As Facilitator (Server)

```typescript
import { setupServer, createDemandSignal } from './payments/x402';

// Setup server with payment address
const server = setupServer({
  network: 'base',
  pricing: {
    basePrices: {
      'api.call': parseUnits('0.01', 6), // $0.01
      'compute.heavy': parseUnits('0.50', 6), // $0.50
    },
    dynamicPricing: true,
    elasticity: 1.5,
  },
  requiredConfirmations: 1,
});

// Handle resource request
app.get('/api/resource', async (req, res) => {
  // Check for payment
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // No payment - issue challenge
    const challenge = server.issueChallenge(
      req.url,
      'api.call',
      'USDC'
    );

    return res.status(402).json({
      error: 'Payment Required',
      challenge,
    });
  }

  // Verify access token
  const token = authHeader.replace('Bearer ', '');
  const access = await server.verifyAccess(token);

  if (!access.valid) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Serve resource
  res.json({ data: '...' });
});

// Handle payment proof submission
app.post('/api/verify-payment', async (req, res) => {
  const proof: X402PaymentProof = req.body;

  try {
    const receipt = await server.verifyPayment(proof);
    res.json(receipt);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Verification failed',
    });
  }
});

// Update demand signals for dynamic pricing
setInterval(() => {
  const signal = createDemandSignal('api.call', {
    requestRate: getCurrentRequestRate(),
    averageRate: getAverageRequestRate(),
    utilization: getSystemUtilization(),
    queueDepth: getQueueDepth(),
  });

  server.updateDemand(signal);
}, 60000); // Every minute

// Check revenue
const stats = await server.getRevenueStats();
console.log('Total revenue:', formatUnits(stats.totalRevenue, 6), 'USDC');
console.log('Total receipts:', stats.totalReceipts);
```

## Configuration

### Client Configuration

```typescript
interface PayerConfig {
  walletAddress: string;
  network: 'base' | 'base-sepolia';
  preferredCurrency: 'USDC' | 'ETH';
  maxAutoPayAmount: bigint; // Safety limit
  autoPayEnabled: boolean;
  budgetTracking: boolean;
  dailyBudget?: bigint;
}
```

### Server Configuration

```typescript
interface FacilitatorConfig {
  paymentAddress: string;
  network: 'base' | 'base-sepolia';
  acceptedCurrencies: ('USDC' | 'ETH')[];
  challengeExpirySeconds: number;
  pricing: PricingConfig;
  minPayment: bigint;
  autoVerify: boolean;
  requiredConfirmations: number;
}
```

## Dynamic Pricing

The pricing engine adjusts prices based on demand:

```typescript
// Price multiplier calculation
multiplier = 1 + sigmoid(demand) * 4

// Demand factors:
- System utilization (40% weight)
- Request rate vs average (40% weight)
- Queue depth (20% weight)

// Result: 1.0x - 5.0x price multiplier
```

Example:
- Low demand: $0.01 USDC (1.0x)
- Normal demand: $0.02 USDC (2.0x)
- High demand: $0.05 USDC (5.0x)

## Event Bus Integration

The x402 system emits events to the Genesis event bus:

```typescript
// Payment initiated
bus.publish('economy.cost.incurred', {
  module: 'x402',
  amount: 0.10,
  category: 'x402-payment',
});

// Payment completed
bus.publish('economy.cost.incurred', {
  module: 'x402',
  amount: 0.10,
  category: 'x402-completed',
});

// Revenue received
bus.publish('economy.revenue.recorded', {
  amount: 0.10,
  revenueSource: 'x402-verified-api.call',
});
```

## Testing

```typescript
import { createTestVerifier } from './payments/x402';

// Create test verifier (allows unconfirmed transactions)
const verifier = createTestVerifier('base-sepolia');

// Verify payment
const result = await verifier.verify(proof, challenge);
console.log('Valid:', result.valid);
console.log('Errors:', result.errors);
```

## Security Considerations

1. **Nonce Protection**: Each challenge has a unique nonce to prevent replay attacks
2. **Expiration**: Challenges expire after configured time (default 5 minutes)
3. **Budget Limits**: Client enforces daily spending limits
4. **On-chain Verification**: All payments verified on Base L2
5. **Confirmation Requirements**: Configurable confirmation count before acceptance
6. **Address Validation**: Strict address matching between challenge and proof

## Network Support

- **Base Mainnet** (`base`)
  - Chain ID: 8453
  - USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

- **Base Sepolia** (`base-sepolia`)
  - Chain ID: 84532
  - USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Integration with Genesis

The x402 system integrates with:
- **Wallet** (`src/economy/live/wallet.ts`) - USDC payments on Base
- **Event Bus** (`src/bus/`) - Payment and revenue events
- **Budget System** - Daily spending limits and tracking

## Future Enhancements

- [ ] JWT-based access tokens with signature verification
- [ ] Multi-currency support (ETH, other tokens)
- [ ] Streaming payments for long-running operations
- [ ] Payment channels for repeated micro-transactions
- [ ] Cross-chain payment verification
- [ ] Payment proof caching for faster verification
- [ ] Bulk payment discounts
- [ ] Subscription-based access tokens

## References

- HTTP 402 Payment Required: https://402.dev
- Base L2: https://base.org
- USDC: https://www.circle.com/usdc
- viem: https://viem.sh
