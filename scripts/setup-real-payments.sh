#!/bin/bash
# Genesis v16.2.3 - Real Payment Setup Script
# Run this to configure real money payments

set -e

echo "======================================"
echo "  GENESIS REAL PAYMENT SETUP"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example to .env first."
    exit 1
fi

# 1. Generate wallet if not exists
echo "STEP 1: Crypto Wallet (Base L2)"
echo "--------------------------------"

if grep -q "GENESIS_PRIVATE_KEY=0x" .env && ! grep -q "GENESIS_PRIVATE_KEY=0x\.\.\." .env; then
    WALLET_ADDRESS=$(node -e "
const { privateKeyToAccount } = require('viem/accounts');
const pk = process.env.GENESIS_PRIVATE_KEY || require('fs').readFileSync('.env', 'utf8').match(/GENESIS_PRIVATE_KEY=([^\n]+)/)?.[1];
if (pk && pk.length > 10) {
    const acc = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x'+pk);
    console.log(acc.address);
} else {
    console.log('NOT_SET');
}
" 2>/dev/null || echo "NOT_SET")

    if [ "$WALLET_ADDRESS" != "NOT_SET" ]; then
        echo "✅ Wallet already configured"
        echo "   Address: $WALLET_ADDRESS"
    fi
else
    echo "❌ No wallet configured"
    echo ""
    echo "Generate a new wallet? This will:"
    echo "- Create a new Ethereum private key"
    echo "- Add it to your .env file"
    echo "- You'll need to fund it with ETH (for gas) and USDC"
    echo ""
    read -p "Generate wallet? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        NEW_KEY=$(node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))")
        WALLET_ADDRESS=$(node -e "
const { privateKeyToAccount } = require('viem/accounts');
console.log(privateKeyToAccount('$NEW_KEY').address);
")

        # Add to .env
        if grep -q "GENESIS_PRIVATE_KEY=" .env; then
            sed -i.bak "s/GENESIS_PRIVATE_KEY=.*/GENESIS_PRIVATE_KEY=$NEW_KEY/" .env
        else
            echo "" >> .env
            echo "# v16.2.3: Base L2 Wallet" >> .env
            echo "GENESIS_PRIVATE_KEY=$NEW_KEY" >> .env
        fi

        echo "✅ Wallet created!"
        echo "   Address: $WALLET_ADDRESS"
        echo ""
        echo "IMPORTANT: Fund this wallet on Base L2:"
        echo "1. Send ETH for gas (0.01 ETH minimum)"
        echo "2. Send USDC for operations"
        echo ""
        echo "Bridge from Ethereum: https://bridge.base.org"
        echo "Buy on Coinbase: https://www.coinbase.com"
    fi
fi

# 2. Check Stripe mode
echo ""
echo "STEP 2: Stripe Payments"
echo "-----------------------"

STRIPE_KEY=$(grep "STRIPE_SECRET_KEY=" .env | cut -d'=' -f2)
if [[ $STRIPE_KEY == sk_live_* ]]; then
    echo "✅ Stripe is in LIVE mode"
elif [[ $STRIPE_KEY == sk_test_* ]]; then
    echo "❌ Stripe is in TEST mode (sk_test_)"
    echo ""
    echo "To receive real payments:"
    echo "1. Go to https://dashboard.stripe.com/apikeys"
    echo "2. Toggle 'Test mode' OFF (top right)"
    echo "3. Copy your Live Secret Key (starts with sk_live_)"
    echo "4. Update STRIPE_SECRET_KEY in .env"
else
    echo "❌ No Stripe key configured"
    echo ""
    echo "To set up Stripe:"
    echo "1. Create account at https://stripe.com"
    echo "2. Go to https://dashboard.stripe.com/apikeys"
    echo "3. Copy your Secret Key to .env as STRIPE_SECRET_KEY"
fi

# 3. Check network
echo ""
echo "STEP 3: Network Configuration"
echo "-----------------------------"

NETWORK=$(grep "GENESIS_NETWORK=" .env | cut -d'=' -f2)
if [ "$NETWORK" == "mainnet" ]; then
    echo "✅ Network is set to MAINNET (real money)"
else
    echo "❌ Network is NOT mainnet (currently: ${NETWORK:-not set})"
    echo ""
    read -p "Switch to mainnet? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if grep -q "GENESIS_NETWORK=" .env; then
            sed -i.bak "s/GENESIS_NETWORK=.*/GENESIS_NETWORK=mainnet/" .env
        else
            echo "GENESIS_NETWORK=mainnet" >> .env
        fi
        echo "✅ Switched to mainnet"
    fi
fi

# 4. Bounty platform accounts
echo ""
echo "STEP 4: Bounty Platform Accounts"
echo "---------------------------------"
echo "To receive bounty payments, set up accounts on:"
echo ""
echo "1. ALGORA (GitHub bounties)"
echo "   https://console.algora.io"
echo "   - Connect your GitHub account"
echo "   - Add your wallet address for payouts"
echo ""
echo "2. GITCOIN (Gitcoin bounties)"
echo "   https://gitcoin.co"
echo "   - Connect wallet"
echo ""
echo "3. DEWORK (Dework bounties)"
echo "   https://dework.xyz"
echo "   - Connect wallet"

# Summary
echo ""
echo "======================================"
echo "  SETUP SUMMARY"
echo "======================================"

# Re-check status
WALLET_OK=false
STRIPE_OK=false
NETWORK_OK=false

grep -q "GENESIS_PRIVATE_KEY=0x" .env && ! grep -q "GENESIS_PRIVATE_KEY=0x\.\.\." .env && WALLET_OK=true
grep -q "STRIPE_SECRET_KEY=sk_live_" .env && STRIPE_OK=true
grep -q "GENESIS_NETWORK=mainnet" .env && NETWORK_OK=true

echo ""
echo "Crypto Wallet: $( $WALLET_OK && echo '✅ Ready' || echo '❌ Not configured' )"
echo "Stripe Live:   $( $STRIPE_OK && echo '✅ Ready' || echo '❌ Test mode' )"
echo "Network:       $( $NETWORK_OK && echo '✅ Mainnet' || echo '❌ Testnet' )"

if $WALLET_OK && $STRIPE_OK && $NETWORK_OK; then
    echo ""
    echo "🎉 ALL SET! Genesis is ready for real money operations."
else
    echo ""
    echo "⚠️  Some items need attention. See above for details."
fi

echo ""
echo "Your pending bounties:"
node -e "
const { PRPipeline } = require('./dist/src/economy/live/pr-pipeline.js');
const p = new PRPipeline({ githubUsername: 'genesis-ai', dryRun: false });
const subs = p.getAllSubmissions().filter(s => s.bountyValue <= 50000);
console.log('  ' + subs.length + ' PRs submitted');
console.log('  \$' + subs.reduce((s,x) => s + x.bountyValue, 0) + ' pending revenue');
" 2>/dev/null || echo "  (rebuild needed to check)"
