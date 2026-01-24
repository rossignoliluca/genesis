/**
 * Live Wallet Connector for Base L2
 *
 * Production-ready wallet implementation using viem for Base mainnet and testnet.
 * Supports ETH and USDC operations with safety checks and gas estimation.
 *
 * Security considerations:
 * - Private key loaded from GENESIS_PRIVATE_KEY environment variable
 * - Balance verification before all send operations
 * - Gas estimation to prevent failed transactions
 * - Proper error handling and logging
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
  type Hash,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// USDC contract addresses on Base
const USDC_ADDRESS_MAINNET: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ADDRESS_TESTNET: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

// USDC ABI (minimal - only what we need)
const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export interface LiveWallet {
  getAddress(): string;
  getBalances(): Promise<{
    eth: bigint;
    usdc: bigint;
    ethFormatted: string;
    usdcFormatted: string;
  }>;
  sendUSDC(
    to: string,
    amount: number
  ): Promise<{ hash: string; success: boolean }>;
  sendETH(
    to: string,
    amountEth: number
  ): Promise<{ hash: string; success: boolean }>;
  signMessage(message: string): Promise<string>;
  isConnected(): boolean;
  getChainId(): number;
}

class BaseWallet implements LiveWallet {
  private account: ReturnType<typeof privateKeyToAccount>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;
  private chain: typeof base | typeof baseSepolia;
  private usdcAddress: Address;
  private connected: boolean = false;

  constructor(privateKey: string, network: 'mainnet' | 'testnet' = 'mainnet') {
    // Validate private key format
    if (!privateKey.startsWith('0x')) {
      privateKey = `0x${privateKey}`;
    }

    if (privateKey.length !== 66) {
      throw new Error(
        'Invalid private key length. Expected 64 hex characters (66 with 0x prefix)'
      );
    }

    // Select chain and USDC address based on network
    this.chain = network === 'mainnet' ? base : baseSepolia;
    this.usdcAddress =
      network === 'mainnet' ? USDC_ADDRESS_MAINNET : USDC_ADDRESS_TESTNET;

    // Create account from private key
    try {
      this.account = privateKeyToAccount(privateKey as `0x${string}`);
    } catch (error) {
      throw new Error(
        `Failed to create account from private key: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Create public client for read operations
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(this.chain.rpcUrls.default.http[0]),
    });

    // Create wallet client for write operations
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.chain.rpcUrls.default.http[0]),
    });

    this.connected = true;

    console.log(
      `[Wallet] Connected to ${network === 'mainnet' ? 'Base Mainnet' : 'Base Sepolia'}`
    );
    console.log(`[Wallet] Address: ${this.account.address}`);
    console.log(`[Wallet] Chain ID: ${this.chain.id}`);
  }

  getAddress(): string {
    return this.account.address;
  }

  async getBalances(): Promise<{
    eth: bigint;
    usdc: bigint;
    ethFormatted: string;
    usdcFormatted: string;
  }> {
    try {
      // Get ETH balance
      const ethBalance = await this.publicClient.getBalance({
        address: this.account.address,
      });

      // Get USDC balance
      const usdcBalance = (await this.publicClient.readContract({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [this.account.address],
      })) as bigint;

      const ethFormatted = formatEther(ethBalance);
      const usdcFormatted = formatUnits(usdcBalance, 6); // USDC has 6 decimals

      return {
        eth: ethBalance,
        usdc: usdcBalance,
        ethFormatted,
        usdcFormatted,
      };
    } catch (error) {
      throw new Error(
        `Failed to get balances: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async sendUSDC(
    to: string,
    amount: number
  ): Promise<{ hash: string; success: boolean }> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Validate address
    if (!to.startsWith('0x') || to.length !== 42) {
      throw new Error('Invalid recipient address');
    }

    try {
      // Convert amount to USDC units (6 decimals)
      const amountInUnits = parseUnits(amount.toString(), 6);

      // Check balance before sending
      const balances = await this.getBalances();
      if (balances.usdc < amountInUnits) {
        throw new Error(
          `Insufficient USDC balance. Required: ${amount} USDC, Available: ${balances.usdcFormatted} USDC`
        );
      }

      console.log(`[Wallet] Sending ${amount} USDC to ${to}...`);

      // Estimate gas for the transaction
      const gasEstimate: bigint = await this.publicClient.estimateContractGas({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [to as Address, amountInUnits],
        account: this.account,
      });

      console.log(`[Wallet] Estimated gas: ${gasEstimate}`);

      // Check if we have enough ETH for gas
      const gasPrice: bigint = await this.publicClient.getGasPrice();
      const estimatedGasCost = gasEstimate * gasPrice;

      if (balances.eth < estimatedGasCost) {
        throw new Error(
          `Insufficient ETH for gas. Required: ${formatEther(estimatedGasCost)} ETH, Available: ${balances.ethFormatted} ETH`
        );
      }

      // Execute the transfer
      const hash = await this.walletClient.writeContract({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [to as Address, amountInUnits],
        gas: gasEstimate,
      });

      console.log(`[Wallet] Transaction sent: ${hash}`);
      console.log(`[Wallet] Waiting for confirmation...`);

      // Wait for transaction receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
      });

      const success = receipt.status === 'success';
      console.log(
        `[Wallet] Transaction ${success ? 'confirmed' : 'failed'}: ${hash}`
      );

      return {
        hash,
        success,
      };
    } catch (error) {
      throw new Error(
        `Failed to send USDC: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async sendETH(
    to: string,
    amountEth: number
  ): Promise<{ hash: string; success: boolean }> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    if (amountEth <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Validate address
    if (!to.startsWith('0x') || to.length !== 42) {
      throw new Error('Invalid recipient address');
    }

    try {
      // Convert amount to wei
      const amountInWei = parseEther(amountEth.toString());

      // Check balance before sending
      const balances = await this.getBalances();

      // Estimate gas
      const gasEstimate: bigint = await this.publicClient.estimateGas({
        account: this.account,
        to: to as Address,
        value: amountInWei,
      });

      const gasPrice: bigint = await this.publicClient.getGasPrice();
      const estimatedGasCost = gasEstimate * gasPrice;
      const totalRequired = amountInWei + estimatedGasCost;

      if (balances.eth < totalRequired) {
        throw new Error(
          `Insufficient ETH balance. Required: ${formatEther(totalRequired)} ETH (${amountEth} + gas), Available: ${balances.ethFormatted} ETH`
        );
      }

      console.log(`[Wallet] Sending ${amountEth} ETH to ${to}...`);
      console.log(`[Wallet] Estimated gas: ${gasEstimate}`);

      // Send transaction
      const hash = await this.walletClient.sendTransaction({
        to: to as Address,
        value: amountInWei,
        gas: gasEstimate,
      });

      console.log(`[Wallet] Transaction sent: ${hash}`);
      console.log(`[Wallet] Waiting for confirmation...`);

      // Wait for transaction receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
      });

      const success = receipt.status === 'success';
      console.log(
        `[Wallet] Transaction ${success ? 'confirmed' : 'failed'}: ${hash}`
      );

      return {
        hash,
        success,
      };
    } catch (error) {
      throw new Error(
        `Failed to send ETH: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.walletClient.signMessage({
        account: this.account,
        message,
      });

      return signature;
    } catch (error) {
      throw new Error(
        `Failed to sign message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getChainId(): number {
    return this.chain.id;
  }
}

// Singleton instance
let walletInstance: BaseWallet | null = null;

/**
 * Get or create the live wallet instance
 *
 * Uses GENESIS_PRIVATE_KEY environment variable for the private key.
 * Uses GENESIS_NETWORK environment variable to select network (mainnet or testnet).
 * Defaults to mainnet if GENESIS_NETWORK is not set.
 *
 * @returns LiveWallet instance
 * @throws Error if GENESIS_PRIVATE_KEY is not set
 */
export function getLiveWallet(): LiveWallet {
  if (walletInstance) {
    return walletInstance;
  }

  const privateKey = process.env.GENESIS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      'GENESIS_PRIVATE_KEY environment variable is required. Set it to your wallet private key.'
    );
  }

  const network = (process.env.GENESIS_NETWORK || 'mainnet') as
    | 'mainnet'
    | 'testnet';

  if (network !== 'mainnet' && network !== 'testnet') {
    throw new Error(
      'GENESIS_NETWORK must be either "mainnet" or "testnet". Defaults to mainnet if not set.'
    );
  }

  walletInstance = new BaseWallet(privateKey, network);
  return walletInstance;
}

/**
 * Reset the wallet instance (useful for testing or switching networks)
 */
export function resetWallet(): void {
  walletInstance = null;
}

// Export for testing purposes
export { BaseWallet };
