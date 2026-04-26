/**
 * AURA50 Light Client Claim Flow
 *
 * Integrated end-to-end flow for claiming epoch rewards on mobile:
 *
 *   1. Get verified epoch root from local EpochRootStore
 *      (optionally fetch + confirm via HTTP if not yet received via WebSocket)
 *   2. Fetch user's Merkle proof from the server
 *   3. Verify the proof LOCALLY against the cached root
 *      → if verification fails, the claim is aborted (tamper detection)
 *   4. Submit the verified claim to the server
 *   5. Notify the app with result + credited amount
 *
 * The local verification step (3) is what makes this a true light node:
 * the mobile device cryptographically confirms its reward without trusting
 * the server's claim endpoint blindly.
 */

import { config as envConfig } from '../../config/environment';
import { epochRootStore } from './EpochRootStore';
import { verifyMerkleProof, VerifiableMerkleProof, MerkleLeafData } from '../crypto/MerkleVerifier';
import { getLightNodeClient, getConfiguredTotalRootSources } from './LightNodeClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClaimRequest {
  epochId: number;
  userId: string;
  /** JWT auth token for the authenticated API calls */
  authToken: string;
  /** Optional staking boost multiplier (backend clamps to [1.0, 1.50]) */
  stakingBoost?: number;
}

export interface ClaimResult {
  success: boolean;
  epochId: number;
  amount?: string;
  reason: string;
  locallyVerified: boolean;
}

/** Shape of GET /api/epochs/:id/proof/:userId response */
interface ProofApiResponse {
  found: boolean;
  epochId: number;
  userId: string;
  proof?: {
    leaf: {
      userId: string;
      amount: string;
      type: 'mining' | 'participation' | 'referral';
      blockHeight: number;
      leafIndex?: number;
    };
    leafIndex: number;
    proof: string[];
    root: string;
  };
  message?: string;
}

/** Shape of POST /api/epochs/:id/claim response */
interface ClaimApiResponse {
  success: boolean;
  amount?: string;
  reason: string;
}

/** Shape of GET /api/epochs/:id response (for HTTP fallback root) */
interface EpochInfoApiResponse {
  status: 'pending' | 'finalized' | 'not_found';
  merkleRoot?: string;
  totalReward?: string;
  participantCount?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = envConfig.baseUrl;

async function apiFetch<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Core claim flow ───────────────────────────────────────────────────────────

/**
 * Claim the caller's reward for the given epoch.
 *
 * Proof verification happens locally on the device — the server cannot
 * deceive the mobile client about its reward amount without the hash chain
 * breaking.
 */
export async function claimEpochReward(req: ClaimRequest): Promise<ClaimResult> {
  const { epochId, userId, authToken, stakingBoost } = req;
  const authHeader = { Authorization: `Bearer ${authToken}` };

  // ── Step 1: Get or fetch the verified epoch root ──────────────────────────

  let verifiedRoot = epochRootStore.getVerified(epochId);

  if (!verifiedRoot) {
    // Root hasn't arrived via WebSocket yet — try HTTP fallback
    try {
      const epochInfo = await apiFetch<EpochInfoApiResponse>(
        `/api/epochs/${epochId}`,
        { method: 'GET', headers: authHeader }
      );

      if (epochInfo.status !== 'finalized' || !epochInfo.merkleRoot) {
        return {
          success: false,
          epochId,
          reason: epochInfo.status === 'pending'
            ? 'Epoch is still in challenge window — try again after the window closes'
            : 'Epoch not found or not yet finalized',
          locallyVerified: false,
        };
      }

      // Record the HTTP observation; respects configured totalRootSources threshold
      try {
        const client = getLightNodeClient();
        verifiedRoot = await client.addHttpFallbackObservation(
          epochId,
          epochInfo.merkleRoot,
          epochInfo.totalReward ?? '0',
          epochInfo.participantCount ?? 0
        );
      } catch {
        // LightNodeClient not initialized — add directly using configured total sources
        // so the HTTP fallback respects the same threshold as the WS path.
        verifiedRoot = await epochRootStore.addObservation(
          epochId,
          {
            source: 'http-fallback',
            merkleRoot: epochInfo.merkleRoot,
            totalReward: epochInfo.totalReward ?? '0',
            participantCount: epochInfo.participantCount ?? 0,
            receivedAt: Date.now(),
          },
          getConfiguredTotalRootSources()
        );
      }

      if (!verifiedRoot) {
        return {
          success: false,
          epochId,
          reason: 'Could not verify epoch root — insufficient sources',
          locallyVerified: false,
        };
      }
    } catch (err) {
      return {
        success: false,
        epochId,
        reason: `Failed to fetch epoch info: ${err instanceof Error ? err.message : String(err)}`,
        locallyVerified: false,
      };
    }
  }

  // ── Step 2: Fetch Merkle proof from server ────────────────────────────────

  let proofData: ProofApiResponse;
  try {
    proofData = await apiFetch<ProofApiResponse>(
      `/api/epochs/${epochId}/proof/${encodeURIComponent(userId)}`,
      { method: 'GET', headers: authHeader }
    );
  } catch (err) {
    return {
      success: false,
      epochId,
      reason: `Failed to fetch proof: ${err instanceof Error ? err.message : String(err)}`,
      locallyVerified: false,
    };
  }

  if (!proofData.found || !proofData.proof) {
    return {
      success: false,
      epochId,
      reason: proofData.message ?? 'No reward found for this epoch',
      locallyVerified: false,
    };
  }

  // ── Step 3: Local cryptographic verification ──────────────────────────────

  const serverProof = proofData.proof;
  const leaf: MerkleLeafData = {
    userId: serverProof.leaf.userId,
    amount: serverProof.leaf.amount,
    type: serverProof.leaf.type,
    blockHeight: serverProof.leaf.blockHeight,
    leafIndex: serverProof.leaf.leafIndex ?? serverProof.leafIndex,
  };

  const merkleProof: VerifiableMerkleProof = {
    leaf,
    leafIndex: serverProof.leafIndex,
    proof: serverProof.proof,
    root: verifiedRoot.merkleRoot, // Use locally-cached verified root, NOT server's root
  };

  const verifyResult = verifyMerkleProof(merkleProof);

  if (!verifyResult.valid) {
    // Tampered proof — do NOT submit claim
    console.error(
      `[LightClaimFlow] Proof verification FAILED for epoch ${epochId}, user ${userId}:`,
      verifyResult.reason
    );
    return {
      success: false,
      epochId,
      reason: `Local proof verification failed: ${verifyResult.reason}`,
      locallyVerified: false,
    };
  }

  console.log(
    `[LightClaimFlow] Proof verified locally for epoch ${epochId} (${verifyResult.durationMs.toFixed(1)}ms)`
  );

  // ── Step 4: Submit claim to server ────────────────────────────────────────

  let claimResponse: ClaimApiResponse;
  try {
    claimResponse = await apiFetch<ClaimApiResponse>(
      `/api/epochs/${epochId}/claim`,
      {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          leafIndex: serverProof.leafIndex,
          proof: serverProof.proof,
          ...(stakingBoost !== undefined && { stakingBoost }),
        }),
      }
    );
  } catch (err) {
    return {
      success: false,
      epochId,
      reason: `Claim submission failed: ${err instanceof Error ? err.message : String(err)}`,
      locallyVerified: true, // proof was valid locally
    };
  }

  return {
    success: claimResponse.success,
    epochId,
    amount: claimResponse.amount,
    reason: claimResponse.reason,
    locallyVerified: true,
  };
}

/**
 * Check whether a claim has already been processed for the given epoch+user.
 * (Thin wrapper — just fetches proof; if not found → already claimed or not eligible.)
 */
export async function getClaimStatus(
  epochId: number,
  userId: string,
  authToken: string
): Promise<'claimable' | 'not_eligible' | 'epoch_not_ready' | 'error'> {
  try {
    const epochInfo = await apiFetch<EpochInfoApiResponse>(
      `/api/epochs/${epochId}`,
      { method: 'GET', headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (epochInfo.status === 'not_found') return 'error';
    if (epochInfo.status === 'pending') return 'epoch_not_ready';

    const proofData = await apiFetch<ProofApiResponse>(
      `/api/epochs/${epochId}/proof/${encodeURIComponent(userId)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${authToken}` } }
    );

    return proofData.found ? 'claimable' : 'not_eligible';
  } catch {
    return 'error';
  }
}
