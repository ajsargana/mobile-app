import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl, config } from '../config/environment';

// Deployed AMM pool contract address — set when pool is deployed on-chain.
// Configure via AsyncStorage key or future remote config.
const AMM_POOL_ADDRESS_KEY = '@aura50_amm_pool_address';
export const DEFAULT_AMM_POOL_ADDRESS = ''; // populated after pool deployment

const SATS_PER_A50 = 100_000_000;

export interface PoolReserves {
  reserve0: number;  // A50 (in satoshis)
  reserve1: number;  // paired token (in satoshis)
  totalSupply: number;
  token0: string;
  token1: string;
}

export interface SwapQuote {
  amountIn: number;    // A50
  amountOut: number;   // paired token (or reverse)
  priceImpactPct: number;
  fee: number;         // 0.3 % of amountIn
  direction: 'a50_to_token1' | 'token1_to_a50';
}

export interface SwapResult {
  txId: string;
  status: 'pending' | 'settled' | 'failed';
}

async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem('@aura50_auth_token');
}

// ── JSON-RPC call helper ──────────────────────────────────────────────────────

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(`${config.baseUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const { result, error } = await res.json();
  if (error) throw new Error(error.message ?? 'RPC error');
  return result;
}

// ── Constant-product math (mirrors AMMPool.as.ts) ─────────────────────────────

function getAmountOut(amountIn: number, reserveIn: number, reserveOut: number): number {
  if (reserveIn <= 0 || reserveOut <= 0 || amountIn <= 0) return 0;
  const amountInWithFee = amountIn * 997;
  return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
}

// ── Service class ─────────────────────────────────────────────────────────────

export class AMMService {
  private static instance: AMMService;
  private poolAddress: string = DEFAULT_AMM_POOL_ADDRESS;
  private cachedReserves: PoolReserves | null = null;
  private reservesTTL: number = 0;

  private constructor() {
    this.loadPoolAddress();
  }

  static getInstance(): AMMService {
    if (!AMMService.instance) {
      AMMService.instance = new AMMService();
    }
    return AMMService.instance;
  }

  private async loadPoolAddress(): Promise<void> {
    const stored = await AsyncStorage.getItem(AMM_POOL_ADDRESS_KEY);
    if (stored) this.poolAddress = stored;
  }

  async setPoolAddress(address: string): Promise<void> {
    this.poolAddress = address;
    this.cachedReserves = null;
    await AsyncStorage.setItem(AMM_POOL_ADDRESS_KEY, address);
  }

  getPoolAddress(): string {
    return this.poolAddress;
  }

  isConfigured(): boolean {
    return this.poolAddress.length > 0;
  }

  // ── Reserves ────────────────────────────────────────────────────────────────

  async getReserves(forceRefresh = false): Promise<PoolReserves> {
    if (!this.isConfigured()) throw new Error('AMM pool address not configured');
    if (!forceRefresh && this.cachedReserves && Date.now() < this.reservesTTL) {
      return this.cachedReserves;
    }

    // eth_call → getReserves()  (view function, no gas)
    const result = await rpcCall('eth_call', [
      { to: this.poolAddress, data: 'getReserves' },
      'latest',
    ]);

    let parsed: { reserve0: number; reserve1: number; totalSupply: number };
    try {
      parsed = JSON.parse(result as string);
    } catch {
      parsed = { reserve0: 0, reserve1: 0, totalSupply: 0 };
    }

    // Also fetch token identifiers
    const t0 = await rpcCall('eth_call', [{ to: this.poolAddress, data: 'getToken0' }, 'latest']).catch(() => 'A50');
    const t1 = await rpcCall('eth_call', [{ to: this.poolAddress, data: 'getToken1' }, 'latest']).catch(() => 'USDT');

    this.cachedReserves = {
      reserve0:    parsed.reserve0,
      reserve1:    parsed.reserve1,
      totalSupply: parsed.totalSupply,
      token0:      String(t0),
      token1:      String(t1),
    };
    this.reservesTTL = Date.now() + 30_000; // 30-second cache
    return this.cachedReserves;
  }

  // ── Quote ───────────────────────────────────────────────────────────────────

  async quoteSwap(amountIn: number, direction: 'a50_to_token1' | 'token1_to_a50'): Promise<SwapQuote> {
    const { reserve0, reserve1 } = await this.getReserves();

    const [reserveIn, reserveOut] = direction === 'a50_to_token1'
      ? [reserve0, reserve1]
      : [reserve1, reserve0];

    const amountInSats = Math.round(amountIn * SATS_PER_A50);
    const amountOutSats = getAmountOut(amountInSats, reserveIn, reserveOut);
    const idealOutSats  = reserveIn > 0 ? (amountInSats * reserveOut) / reserveIn : 0;
    const priceImpact   = idealOutSats > 0 ? (1 - amountOutSats / idealOutSats) * 100 : 0;

    return {
      amountIn,
      amountOut:       amountOutSats / SATS_PER_A50,
      priceImpactPct:  Math.min(priceImpact, 100),
      fee:             amountIn * 0.003,
      direction,
    };
  }

  // ── Execute swap ────────────────────────────────────────────────────────────

  async executeSwap(
    amountIn: number,
    minOut: number,
    direction: 'a50_to_token1' | 'token1_to_a50',
  ): Promise<SwapResult> {
    if (!this.isConfigured()) throw new Error('AMM pool address not configured');

    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const fnName   = direction === 'a50_to_token1' ? 'swap0to1' : 'swap1to0';
    const amountInSats = Math.round(amountIn * SATS_PER_A50);
    const minOutSats   = Math.round(minOut * SATS_PER_A50);

    const url = `${getApiUrl('/api/contracts')}/${this.poolAddress}/call`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        function: fnName,
        args: [amountInSats, minOutSats],
        gasLimit: 500_000,
      }),
    });

    if (!res.ok) {
      const { message } = await res.json().catch(() => ({ message: 'Swap failed' }));
      throw new Error(message);
    }

    const { txId } = await res.json();
    this.cachedReserves = null; // invalidate cache after swap
    return { txId, status: 'pending' };
  }

  // ── Liquidity ───────────────────────────────────────────────────────────────

  async getUserLPBalance(walletAddress: string): Promise<number> {
    if (!this.isConfigured()) return 0;
    try {
      const result = await rpcCall('eth_call', [
        { to: this.poolAddress, data: `lpBalanceOf:${walletAddress}` },
        'latest',
      ]);
      return Number(result) / SATS_PER_A50;
    } catch {
      return 0;
    }
  }
}

export default AMMService;
