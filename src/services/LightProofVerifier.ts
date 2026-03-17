/**
 * Mobile Light Proof Verifier
 *
 * Ultra-lightweight proof verification for mobile devices
 * - No proof generation (only verification)
 * - Simple hash operations only
 * - Target: <10ms on any device
 * - Works offline with cached proofs
 */

import { createHash } from 'crypto';

export interface MobileOptimizedProof {
  // User reward data (40 bytes)
  userId: string;
  amount: string;
  blockHeight: number;

  // Spatial Merkle proof (~320 bytes for 10K users)
  spatialProof: string[];
  spatialRoot: string;

  // Temporal verification (64 bytes)
  temporalRoot: string;
  checkpointHeight: number;

  // Trust metadata (16 bytes)
  trustLevel: number; // 0-100
  compressionAge: number; // days since compression
}

export interface VerificationResult {
  isValid: boolean;
  verificationTimeMs: number;
  proofSizeBytes: number;
  trustLevel: 'new' | 'established' | 'veteran' | 'legend';
  details?: string;
}

export class LightProofVerifier {

  /**
   * Verify a pre-generated proof (mobile-optimized)
   * Complexity: O(log n) hash operations
   * Expected time: <10ms on any device
   */
  static verifyTemporalProof(
    proof: MobileOptimizedProof,
    trustedTemporalRoot: string
  ): VerificationResult {
    const startTime = performance.now();

    try {
      // Step 1: Verify spatial Merkle proof
      const spatialValid = this.verifySpatialMerkleProof(proof);

      if (!spatialValid) {
        return this.createResult(false, startTime, proof, 'Spatial proof invalid');
      }

      // Step 2: Verify temporal root matches
      if (proof.temporalRoot !== trustedTemporalRoot) {
        return this.createResult(false, startTime, proof, 'Temporal root mismatch');
      }

      // Step 3: All checks passed
      return this.createResult(true, startTime, proof, 'Valid');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createResult(false, startTime, proof, `Error: ${message}`);
    }
  }

  /**
   * Verify spatial Merkle proof (standard Bitcoin SPV style)
   * This is the core cryptographic verification
   */
  private static verifySpatialMerkleProof(proof: MobileOptimizedProof): boolean {
    // Create leaf hash from user data
    let hash = this.hashLeaf({
      userId: proof.userId,
      amount: proof.amount,
      blockHeight: proof.blockHeight,
      type: 'mining_reward'
    });

    // Traverse Merkle tree path
    let index = 0; // Leaf index (would be provided in full proof)
    for (const siblingHash of proof.spatialProof) {
      // Combine with sibling based on position
      if (index % 2 === 0) {
        hash = this.hashPair(hash, siblingHash);
      } else {
        hash = this.hashPair(siblingHash, hash);
      }
      index = Math.floor(index / 2);
    }

    // Final hash should match the spatial root
    return hash === proof.spatialRoot;
  }

  /**
   * Hash a leaf node (user reward data)
   * Uses SHA256 for compatibility with Bitcoin/standard Merkle trees
   */
  private static hashLeaf(data: any): string {
    const leafData = `${data.userId}:${data.amount}:${data.type}:${data.blockHeight}`;
    return createHash('sha256').update(leafData).digest('hex');
  }

  /**
   * Hash a pair of nodes (standard Merkle tree operation)
   */
  private static hashPair(left: string, right: string): string {
    return createHash('sha256').update(left + right).digest('hex');
  }

  /**
   * Calculate trust level based on compression age
   */
  private static calculateTrustLevel(compressionAge: number): 'new' | 'established' | 'veteran' | 'legend' {
    if (compressionAge < 30) return 'new';        // < 1 month
    if (compressionAge < 365) return 'established'; // < 1 year
    if (compressionAge < 1095) return 'veteran';    // < 3 years
    return 'legend';                                 // 3+ years
  }

  /**
   * Create verification result
   */
  private static createResult(
    isValid: boolean,
    startTime: number,
    proof: MobileOptimizedProof,
    details: string
  ): VerificationResult {
    const endTime = performance.now();
    const proofSize = JSON.stringify(proof).length;

    return {
      isValid,
      verificationTimeMs: endTime - startTime,
      proofSizeBytes: proofSize,
      trustLevel: this.calculateTrustLevel(proof.compressionAge),
      details
    };
  }

  /**
   * Verify multiple proofs in batch (more efficient)
   */
  static verifyBatch(
    proofs: MobileOptimizedProof[],
    trustedTemporalRoot: string
  ): VerificationResult[] {
    return proofs.map(proof => this.verifyTemporalProof(proof, trustedTemporalRoot));
  }

  /**
   * Quick validation check (for cached proofs)
   * Just checks structure, not cryptographic validity
   */
  static quickValidate(proof: MobileOptimizedProof): boolean {
    return !!(
      proof.userId &&
      proof.amount &&
      proof.blockHeight > 0 &&
      proof.spatialProof &&
      proof.spatialProof.length > 0 &&
      proof.spatialRoot &&
      proof.temporalRoot
    );
  }
}
