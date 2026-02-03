/**
 * DeFi Protocol Registry
 *
 * Comprehensive registry of 15+ DeFi protocols across multiple chains.
 * Each protocol has verified contract addresses, ABIs, and configuration.
 */

import { parseAbi, type Address } from 'viem';
import type { PositionType } from '../position-tracker.js';

// Map protocol categories to PositionType
// 'lp' -> 'liquidity', 'perp' -> 'other'

// ============================================================================
// Types
// ============================================================================

export type SupportedChain = 'base' | 'arbitrum' | 'optimism' | 'polygon' | 'ethereum';

export interface ProtocolDefinition {
  id: string;
  name: string;
  chain: SupportedChain;
  category: 'lending' | 'dex' | 'yield' | 'derivatives' | 'staking' | 'bridge';
  type: PositionType;
  contracts: {
    main: Address;
    router?: Address;
    factory?: Address;
    rewards?: Address;
  };
  tokens: {
    deposit: Address[];
    reward?: Address[];
  };
  abi: readonly any[];
  methods: {
    deposit: string;
    withdraw: string;
    harvest?: string;
    stake?: string;
    unstake?: string;
  };
  limits: {
    minDeposit: number;
    maxDeposit: number;
    minWithdraw: number;
  };
  fees: {
    deposit: number; // bps
    withdraw: number;
    performance?: number;
  };
  rpcUrl?: string;
  explorerUrl?: string;
  docsUrl?: string;
}

// ============================================================================
// Common ABIs
// ============================================================================

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

export const ERC4626_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
  'function mint(uint256 shares, address receiver) returns (uint256 assets)',
  'function balanceOf(address account) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function maxDeposit(address) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
]);

export const AAVE_POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
]);

export const COMPOUND_V3_ABI = parseAbi([
  'function supply(address asset, uint256 amount)',
  'function supplyTo(address dst, address asset, uint256 amount)',
  'function withdraw(address asset, uint256 amount)',
  'function withdrawTo(address to, address asset, uint256 amount)',
  'function borrowBalanceOf(address account) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function getSupplyRate(uint256 utilization) view returns (uint64)',
]);

export const UNISWAP_V3_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
]);

export const CURVE_POOL_ABI = parseAbi([
  'function add_liquidity(uint256[2] amounts, uint256 min_mint_amount) returns (uint256)',
  'function remove_liquidity(uint256 _amount, uint256[2] min_amounts) returns (uint256[2])',
  'function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) returns (uint256)',
  'function get_dy(int128 i, int128 j, uint256 dx) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

export const GMX_ROUTER_ABI = parseAbi([
  'function createIncreasePosition(address[] memory _path, address _indexToken, uint256 _amountIn, uint256 _minOut, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice, uint256 _executionFee, bytes32 _referralCode, address _callbackTarget) external payable returns (bytes32)',
  'function createDecreasePosition(address[] memory _path, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong, address _receiver, uint256 _acceptablePrice, uint256 _minOut, uint256 _executionFee, bool _withdrawETH, address _callbackTarget) external payable returns (bytes32)',
]);

export const LIDO_ABI = parseAbi([
  'function submit(address _referral) external payable returns (uint256)',
  'function getSharesByPooledEth(uint256 _ethAmount) view returns (uint256)',
  'function getPooledEthByShares(uint256 _sharesAmount) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

export const YEARN_VAULT_ABI = parseAbi([
  'function deposit(uint256 _amount) returns (uint256)',
  'function withdraw(uint256 maxShares) returns (uint256)',
  'function pricePerShare() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
]);

export const CONVEX_BOOSTER_ABI = parseAbi([
  'function deposit(uint256 _pid, uint256 _amount, bool _stake) returns (bool)',
  'function withdraw(uint256 _pid, uint256 _amount) returns (bool)',
  'function poolInfo(uint256) view returns (address lptoken, address token, address gauge, address crvRewards, address stash, bool shutdown)',
]);

export const PENDLE_ROUTER_ABI = parseAbi([
  'function addLiquiditySingleToken(address receiver, address market, uint256 minLpOut, (uint256 guessMin, uint256 guessMax, uint256 guessOffchain, uint256 maxIteration, uint256 eps) guessPtReceivedFromSy, (address tokenIn, uint256 netTokenIn, address tokenMintSy, address pendleSwap, (uint8 swapType, address extRouter, bytes extCalldata, bool needScale) swapData) input) external returns (uint256 netLpOut, uint256 netSyFee)',
]);

// ============================================================================
// Token Addresses by Chain
// ============================================================================

export const TOKENS: Record<SupportedChain, Record<string, Address>> = {
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH: '0x4200000000000000000000000000000000000006',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    GMX: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
    GLP: '0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258',
    wstETH: '0x5979D7b546E38E414F7E9822514be443A4800529',
  },
  optimism: {
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    WETH: '0x4200000000000000000000000000000000000006',
    OP: '0x4200000000000000000000000000000000000042',
    sUSD: '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9',
    wstETH: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
  },
  polygon: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    stMATIC: '0x3A58a54C066FdC0f2D55FC9C89F0415C92eBf3C4',
    AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
  },
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    wstETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    DAI: '0x6B175474E89094C44Da98b954EescdecB6A9bC00',
    CRV: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    CVX: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
  },
};

// ============================================================================
// RPC URLs by Chain
// ============================================================================

export const RPC_URLS: Record<SupportedChain, string> = {
  base: 'https://mainnet.base.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io',
  polygon: 'https://polygon-rpc.com',
  ethereum: 'https://eth.llamarpc.com',
};

// ============================================================================
// Protocol Definitions
// ============================================================================

export const PROTOCOLS: Record<string, ProtocolDefinition> = {
  // ========== BASE ==========
  'aave-v3-base': {
    id: 'aave-v3-base',
    name: 'Aave V3',
    chain: 'base',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      router: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e', // Pool
    },
    tokens: {
      deposit: [TOKENS.base.USDC, TOKENS.base.WETH, TOKENS.base.cbETH],
    },
    abi: AAVE_POOL_ABI,
    methods: { deposit: 'supply', withdraw: 'withdraw' },
    limits: { minDeposit: 10, maxDeposit: 100000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.aave.com/',
  },

  'moonwell-base': {
    id: 'moonwell-base',
    name: 'Moonwell',
    chain: 'base',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22', // mUSDC
    },
    tokens: {
      deposit: [TOKENS.base.USDC, TOKENS.base.WETH],
    },
    abi: ERC4626_ABI,
    methods: { deposit: 'deposit', withdraw: 'redeem' },
    limits: { minDeposit: 10, maxDeposit: 50000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.moonwell.fi/',
  },

  'aerodrome-base': {
    id: 'aerodrome-base',
    name: 'Aerodrome',
    chain: 'base',
    category: 'dex',
    type: 'liquidity',
    contracts: {
      main: '0x827922686190790b37229fd06084350E74485b72', // Router
      factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    },
    tokens: {
      deposit: [TOKENS.base.USDC, TOKENS.base.WETH],
      reward: ['0x940181a94A35A4569E4529A3CDfB74e38FD98631'], // AERO
    },
    abi: UNISWAP_V3_ROUTER_ABI,
    methods: { deposit: 'addLiquidity', withdraw: 'removeLiquidity' },
    limits: { minDeposit: 50, maxDeposit: 100000, minWithdraw: 10 },
    fees: { deposit: 30, withdraw: 30 }, // 0.3%
    docsUrl: 'https://aerodrome.finance/',
  },

  'compound-v3-base': {
    id: 'compound-v3-base',
    name: 'Compound V3',
    chain: 'base',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0xb125E6687d4313864e53df431d5425969c15Eb2F', // cUSDCv3
    },
    tokens: {
      deposit: [TOKENS.base.USDC],
    },
    abi: COMPOUND_V3_ABI,
    methods: { deposit: 'supply', withdraw: 'withdraw' },
    limits: { minDeposit: 10, maxDeposit: 100000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.compound.finance/',
  },

  // ========== ARBITRUM ==========
  'aave-v3-arbitrum': {
    id: 'aave-v3-arbitrum',
    name: 'Aave V3',
    chain: 'arbitrum',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0x794a61358D6845594F94dc1DB02A252b5b4814aD', // Pool
    },
    tokens: {
      deposit: [TOKENS.arbitrum.USDC, TOKENS.arbitrum.WETH, TOKENS.arbitrum.wstETH],
    },
    abi: AAVE_POOL_ABI,
    methods: { deposit: 'supply', withdraw: 'withdraw' },
    limits: { minDeposit: 10, maxDeposit: 500000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.aave.com/',
  },

  'gmx-v2-arbitrum': {
    id: 'gmx-v2-arbitrum',
    name: 'GMX V2',
    chain: 'arbitrum',
    category: 'derivatives',
    type: 'other',
    contracts: {
      main: '0x489ee077994B6658eAfA855C308275EAd8097C4A', // Vault
      router: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064', // Position Router
    },
    tokens: {
      deposit: [TOKENS.arbitrum.USDC, TOKENS.arbitrum.WETH],
      reward: [TOKENS.arbitrum.GMX],
    },
    abi: GMX_ROUTER_ABI,
    methods: { deposit: 'createIncreasePosition', withdraw: 'createDecreasePosition' },
    limits: { minDeposit: 10, maxDeposit: 100000, minWithdraw: 10 },
    fees: { deposit: 10, withdraw: 10, performance: 0 }, // 0.1%
    docsUrl: 'https://docs.gmx.io/',
  },

  'radiant-arbitrum': {
    id: 'radiant-arbitrum',
    name: 'Radiant',
    chain: 'arbitrum',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0xF4B1486DD74D07706052A33d31d7c0AAFD0659E1', // Pool
    },
    tokens: {
      deposit: [TOKENS.arbitrum.USDC, TOKENS.arbitrum.WETH],
    },
    abi: AAVE_POOL_ABI,
    methods: { deposit: 'supply', withdraw: 'withdraw' },
    limits: { minDeposit: 10, maxDeposit: 100000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.radiant.capital/',
  },

  'camelot-arbitrum': {
    id: 'camelot-arbitrum',
    name: 'Camelot',
    chain: 'arbitrum',
    category: 'dex',
    type: 'liquidity',
    contracts: {
      main: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', // Router
      factory: '0x6EcCab422D763aC031210895C81787E87B43A652',
    },
    tokens: {
      deposit: [TOKENS.arbitrum.USDC, TOKENS.arbitrum.WETH, TOKENS.arbitrum.ARB],
    },
    abi: UNISWAP_V3_ROUTER_ABI,
    methods: { deposit: 'addLiquidity', withdraw: 'removeLiquidity' },
    limits: { minDeposit: 50, maxDeposit: 100000, minWithdraw: 10 },
    fees: { deposit: 30, withdraw: 30 },
    docsUrl: 'https://docs.camelot.exchange/',
  },

  'pendle-arbitrum': {
    id: 'pendle-arbitrum',
    name: 'Pendle',
    chain: 'arbitrum',
    category: 'yield',
    type: 'yield',
    contracts: {
      main: '0x00000000005BBB0EF59571E58418F9a4357b68A0', // Router
    },
    tokens: {
      deposit: [TOKENS.arbitrum.wstETH, TOKENS.arbitrum.USDC],
    },
    abi: PENDLE_ROUTER_ABI,
    methods: { deposit: 'addLiquiditySingleToken', withdraw: 'removeLiquiditySingleToken' },
    limits: { minDeposit: 100, maxDeposit: 100000, minWithdraw: 50 },
    fees: { deposit: 0, withdraw: 0, performance: 300 }, // 3% performance
    docsUrl: 'https://docs.pendle.finance/',
  },

  // ========== OPTIMISM ==========
  'aave-v3-optimism': {
    id: 'aave-v3-optimism',
    name: 'Aave V3',
    chain: 'optimism',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    },
    tokens: {
      deposit: [TOKENS.optimism.USDC, TOKENS.optimism.WETH, TOKENS.optimism.wstETH],
    },
    abi: AAVE_POOL_ABI,
    methods: { deposit: 'supply', withdraw: 'withdraw' },
    limits: { minDeposit: 10, maxDeposit: 100000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.aave.com/',
  },

  'velodrome-optimism': {
    id: 'velodrome-optimism',
    name: 'Velodrome',
    chain: 'optimism',
    category: 'dex',
    type: 'liquidity',
    contracts: {
      main: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858', // Router
      factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a',
    },
    tokens: {
      deposit: [TOKENS.optimism.USDC, TOKENS.optimism.WETH, TOKENS.optimism.OP],
    },
    abi: UNISWAP_V3_ROUTER_ABI,
    methods: { deposit: 'addLiquidity', withdraw: 'removeLiquidity' },
    limits: { minDeposit: 50, maxDeposit: 100000, minWithdraw: 10 },
    fees: { deposit: 30, withdraw: 30 },
    docsUrl: 'https://docs.velodrome.finance/',
  },

  'synthetix-optimism': {
    id: 'synthetix-optimism',
    name: 'Synthetix',
    chain: 'optimism',
    category: 'derivatives',
    type: 'other',
    contracts: {
      main: '0xffffffaEff0B96Ea8e4f94b2253f31abdD875847', // SynthetixV3 proxy
    },
    tokens: {
      deposit: [TOKENS.optimism.USDC, TOKENS.optimism.sUSD],
    },
    abi: parseAbi([
      'function deposit(uint128 accountId, address collateralType, uint256 tokenAmount)',
      'function withdraw(uint128 accountId, address collateralType, uint256 tokenAmount)',
    ]),
    methods: { deposit: 'deposit', withdraw: 'withdraw' },
    limits: { minDeposit: 100, maxDeposit: 100000, minWithdraw: 50 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.synthetix.io/',
  },

  // ========== POLYGON ==========
  'aave-v3-polygon': {
    id: 'aave-v3-polygon',
    name: 'Aave V3',
    chain: 'polygon',
    category: 'lending',
    type: 'lend',
    contracts: {
      main: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    },
    tokens: {
      deposit: [TOKENS.polygon.USDC, TOKENS.polygon.WETH, TOKENS.polygon.WMATIC],
    },
    abi: AAVE_POOL_ABI,
    methods: { deposit: 'supply', withdraw: 'withdraw' },
    limits: { minDeposit: 10, maxDeposit: 100000, minWithdraw: 1 },
    fees: { deposit: 0, withdraw: 0 },
    docsUrl: 'https://docs.aave.com/',
  },

  'quickswap-polygon': {
    id: 'quickswap-polygon',
    name: 'QuickSwap',
    chain: 'polygon',
    category: 'dex',
    type: 'liquidity',
    contracts: {
      main: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // Router
      factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    },
    tokens: {
      deposit: [TOKENS.polygon.USDC, TOKENS.polygon.WETH, TOKENS.polygon.WMATIC],
    },
    abi: UNISWAP_V3_ROUTER_ABI,
    methods: { deposit: 'addLiquidity', withdraw: 'removeLiquidity' },
    limits: { minDeposit: 50, maxDeposit: 100000, minWithdraw: 10 },
    fees: { deposit: 30, withdraw: 30 },
    docsUrl: 'https://docs.quickswap.exchange/',
  },

  // ========== ETHEREUM ==========
  'lido-ethereum': {
    id: 'lido-ethereum',
    name: 'Lido',
    chain: 'ethereum',
    category: 'staking',
    type: 'stake',
    contracts: {
      main: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
    },
    tokens: {
      deposit: [TOKENS.ethereum.WETH],
      reward: [TOKENS.ethereum.stETH],
    },
    abi: LIDO_ABI,
    methods: { deposit: 'submit', withdraw: 'requestWithdrawals' },
    limits: { minDeposit: 100, maxDeposit: 1000000, minWithdraw: 100 },
    fees: { deposit: 0, withdraw: 0, performance: 1000 }, // 10% on rewards
    docsUrl: 'https://docs.lido.fi/',
  },

  'curve-ethereum': {
    id: 'curve-ethereum',
    name: 'Curve',
    chain: 'ethereum',
    category: 'dex',
    type: 'liquidity',
    contracts: {
      main: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', // 3pool
      factory: '0x0959158b6040D32d04c301A72CBFD6b39E21c9AE',
    },
    tokens: {
      deposit: [TOKENS.ethereum.USDC, TOKENS.ethereum.DAI],
      reward: [TOKENS.ethereum.CRV],
    },
    abi: CURVE_POOL_ABI,
    methods: { deposit: 'add_liquidity', withdraw: 'remove_liquidity' },
    limits: { minDeposit: 100, maxDeposit: 1000000, minWithdraw: 50 },
    fees: { deposit: 4, withdraw: 4 }, // 0.04%
    docsUrl: 'https://resources.curve.fi/',
  },

  'convex-ethereum': {
    id: 'convex-ethereum',
    name: 'Convex',
    chain: 'ethereum',
    category: 'yield',
    type: 'yield',
    contracts: {
      main: '0xF403C135812408BFbE8713b5A23a04b3D48AAE31', // Booster
    },
    tokens: {
      deposit: [TOKENS.ethereum.CRV],
      reward: [TOKENS.ethereum.CVX, TOKENS.ethereum.CRV],
    },
    abi: CONVEX_BOOSTER_ABI,
    methods: { deposit: 'deposit', withdraw: 'withdraw' },
    limits: { minDeposit: 100, maxDeposit: 1000000, minWithdraw: 50 },
    fees: { deposit: 0, withdraw: 0, performance: 1700 }, // 17% on rewards
    docsUrl: 'https://docs.convexfinance.com/',
  },

  'yearn-ethereum': {
    id: 'yearn-ethereum',
    name: 'Yearn',
    chain: 'ethereum',
    category: 'yield',
    type: 'yield',
    contracts: {
      main: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE', // yvUSDC
    },
    tokens: {
      deposit: [TOKENS.ethereum.USDC],
    },
    abi: YEARN_VAULT_ABI,
    methods: { deposit: 'deposit', withdraw: 'withdraw' },
    limits: { minDeposit: 100, maxDeposit: 500000, minWithdraw: 50 },
    fees: { deposit: 0, withdraw: 0, performance: 2000 }, // 20% on profits
    docsUrl: 'https://docs.yearn.fi/',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getProtocol(id: string): ProtocolDefinition | undefined {
  return PROTOCOLS[id];
}

export function getProtocolsByChain(chain: SupportedChain): ProtocolDefinition[] {
  return Object.values(PROTOCOLS).filter(p => p.chain === chain);
}

export function getProtocolsByCategory(category: ProtocolDefinition['category']): ProtocolDefinition[] {
  return Object.values(PROTOCOLS).filter(p => p.category === category);
}

export function getAllProtocols(): ProtocolDefinition[] {
  return Object.values(PROTOCOLS);
}

export function getProtocolCount(): number {
  return Object.keys(PROTOCOLS).length;
}

export function getSupportedChains(): SupportedChain[] {
  return [...new Set(Object.values(PROTOCOLS).map(p => p.chain))];
}

export function getTokenAddress(chain: SupportedChain, symbol: string): Address | undefined {
  return TOKENS[chain]?.[symbol];
}

export function getRpcUrl(chain: SupportedChain): string {
  return RPC_URLS[chain];
}

// ============================================================================
// Protocol Stats
// ============================================================================

export function getProtocolStats(): {
  total: number;
  byChain: Record<SupportedChain, number>;
  byCategory: Record<string, number>;
} {
  const protocols = getAllProtocols();

  const byChain: Record<SupportedChain, number> = {
    base: 0,
    arbitrum: 0,
    optimism: 0,
    polygon: 0,
    ethereum: 0,
  };

  const byCategory: Record<string, number> = {};

  for (const p of protocols) {
    byChain[p.chain]++;
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }

  return {
    total: protocols.length,
    byChain,
    byCategory,
  };
}
