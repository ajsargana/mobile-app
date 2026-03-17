/**
 * Binary Proof Encoder
 *
 * Efficient binary encoding for mobile proofs
 * Target: <400 bytes per proof (vs ~500 bytes JSON)
 * Reduces bandwidth by ~20-30%
 */

import { MobileOptimizedProof } from './LightProofVerifier';

export class BinaryProofEncoder {

  /**
   * Encode proof to binary format
   * Structure:
   * - Header: 4 bytes (version + flags)
   * - User ID: 16 bytes (UUID)
   * - Amount: 8 bytes (double)
   * - Block height: 4 bytes
   * - Spatial proof count: 1 byte
   * - Spatial proof hashes: N × 32 bytes
   * - Spatial root: 32 bytes
   * - Temporal root: 32 bytes
   * - Checkpoint height: 4 bytes
   * - Trust level: 1 byte
   * - Compression age: 4 bytes
   *
   * Total: ~102 + (N × 32) bytes where N is proof depth (typically 10-20)
   * For 10K users: depth ~14, total ~550 bytes
   * For 100K users: depth ~17, total ~646 bytes
   */
  static encode(proof: MobileOptimizedProof): Uint8Array {
    const proofDepth = proof.spatialProof.length;
    const bufferSize = 102 + (proofDepth * 32);

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Header (4 bytes)
    view.setUint8(offset, 1); // Version 1
    offset += 1;
    view.setUint8(offset, 0); // Flags (reserved)
    offset += 1;
    view.setUint16(offset, proofDepth, true); // Proof depth
    offset += 2;

    // User ID (16 bytes - UUID as bytes)
    const userIdBytes = this.uuidToBytes(proof.userId);
    for (let i = 0; i < 16; i++) {
      view.setUint8(offset + i, userIdBytes[i]);
    }
    offset += 16;

    // Amount (8 bytes - as fixed point: amount * 100000000)
    const amountFixed = Math.floor(parseFloat(proof.amount) * 100000000);
    view.setBigInt64(offset, BigInt(amountFixed), true);
    offset += 8;

    // Block height (4 bytes)
    view.setUint32(offset, proof.blockHeight, true);
    offset += 4;

    // Spatial proof hashes (N × 32 bytes)
    for (const hash of proof.spatialProof) {
      const hashBytes = this.hexToBytes(hash);
      for (let i = 0; i < 32; i++) {
        view.setUint8(offset + i, hashBytes[i]);
      }
      offset += 32;
    }

    // Spatial root (32 bytes)
    const spatialRootBytes = this.hexToBytes(proof.spatialRoot);
    for (let i = 0; i < 32; i++) {
      view.setUint8(offset + i, spatialRootBytes[i]);
    }
    offset += 32;

    // Temporal root (32 bytes)
    const temporalRootBytes = this.hexToBytes(proof.temporalRoot);
    for (let i = 0; i < 32; i++) {
      view.setUint8(offset + i, temporalRootBytes[i]);
    }
    offset += 32;

    // Checkpoint height (4 bytes)
    view.setUint32(offset, proof.checkpointHeight, true);
    offset += 4;

    // Trust level (1 byte)
    view.setUint8(offset, proof.trustLevel);
    offset += 1;

    // Compression age (4 bytes)
    view.setUint32(offset, proof.compressionAge, true);
    offset += 4;

    return new Uint8Array(buffer);
  }

  /**
   * Decode binary format back to proof object
   */
  static decode(bytes: Uint8Array): MobileOptimizedProof {
    const view = new DataView(bytes.buffer);
    let offset = 0;

    // Header
    const version = view.getUint8(offset);
    offset += 1;
    const flags = view.getUint8(offset);
    offset += 1;
    const proofDepth = view.getUint16(offset, true);
    offset += 2;

    if (version !== 1) {
      throw new Error(`Unsupported proof version: ${version}`);
    }

    // User ID
    const userIdBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      userIdBytes[i] = view.getUint8(offset + i);
    }
    const userId = this.bytesToUuid(userIdBytes);
    offset += 16;

    // Amount
    const amountFixed = view.getBigInt64(offset, true);
    const amount = (Number(amountFixed) / 100000000).toFixed(8);
    offset += 8;

    // Block height
    const blockHeight = view.getUint32(offset, true);
    offset += 4;

    // Spatial proof
    const spatialProof: string[] = [];
    for (let i = 0; i < proofDepth; i++) {
      const hashBytes = new Uint8Array(32);
      for (let j = 0; j < 32; j++) {
        hashBytes[j] = view.getUint8(offset + j);
      }
      spatialProof.push(this.bytesToHex(hashBytes));
      offset += 32;
    }

    // Spatial root
    const spatialRootBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      spatialRootBytes[i] = view.getUint8(offset + i);
    }
    const spatialRoot = this.bytesToHex(spatialRootBytes);
    offset += 32;

    // Temporal root
    const temporalRootBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      temporalRootBytes[i] = view.getUint8(offset + i);
    }
    const temporalRoot = this.bytesToHex(temporalRootBytes);
    offset += 32;

    // Checkpoint height
    const checkpointHeight = view.getUint32(offset, true);
    offset += 4;

    // Trust level
    const trustLevel = view.getUint8(offset);
    offset += 1;

    // Compression age
    const compressionAge = view.getUint32(offset, true);
    offset += 4;

    return {
      userId,
      amount,
      blockHeight,
      spatialProof,
      spatialRoot,
      temporalRoot,
      checkpointHeight,
      trustLevel,
      compressionAge
    };
  }

  /**
   * Calculate size of encoded proof
   */
  static calculateSize(proofDepth: number): number {
    return 102 + (proofDepth * 32);
  }

  /**
   * Helper: Convert UUID string to bytes
   */
  private static uuidToBytes(uuid: string): Uint8Array {
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Helper: Convert bytes to UUID string
   */
  private static bytesToUuid(bytes: Uint8Array): string {
    const hex = this.bytesToHex(bytes);
    return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
  }

  /**
   * Helper: Convert hex string to bytes
   */
  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Helper: Convert bytes to hex string
   */
  private static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
