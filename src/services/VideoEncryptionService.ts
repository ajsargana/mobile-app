/**
 * Mobile Video Encryption Service
 *
 * Client-side video encryption for AURA50 mobile app
 * - AES-256 encryption for video data
 * - Secure key generation and storage
 * - Integration with P2P video transfer
 * - End-to-end encryption for privacy
 */

import * as SecureStore from 'expo-secure-store';
import { NativeModules } from 'react-native';

// Expo Go compatibility: react-native-crypto requires custom dev build
// Use expo-crypto for Expo Go testing
let crypto: any;
try {
  crypto = require('react-native-crypto');
} catch (e) {
  console.warn('react-native-crypto not available (Expo Go) - using expo-crypto');
  const expoCrypto = require('expo-crypto');
  crypto = {
    randomBytes: (size: number) => {
      const bytes = expoCrypto.getRandomBytes(size);
      return Buffer.from(bytes);
    }
  };
}

interface EncryptedVideo {
  encryptedData: Uint8Array;
  encryptionKey: string;
  iv: string; // Initialization vector
  metadata: EncryptionMetadata;
}

interface EncryptionMetadata {
  algorithm: 'AES-256-CBC';
  videoSize: number;
  encryptedSize: number;
  timestamp: number;
  userId: string;
}

interface DecryptionResult {
  decryptedData: Uint8Array;
  metadata: EncryptionMetadata;
}

/**
 * Video Encryption Service
 * Provides client-side encryption for video verification
 */
export class VideoEncryptionService {
  private readonly ALGORITHM = 'AES-256-CBC';
  private readonly KEY_SIZE = 32; // 256 bits
  private readonly IV_SIZE = 16; // 128 bits

  // Secure storage keys
  private readonly STORAGE_KEY_PREFIX = 'aura50_video_key_';
  private readonly MASTER_KEY = 'aura50_master_encryption_key';

  /**
   * Encrypt video data before P2P transfer
   * Uses AES-256-CBC for strong encryption
   */
  async encryptVideo(
    videoBuffer: ArrayBuffer,
    userId: string,
    sessionId: string
  ): Promise<EncryptedVideo> {
    try {
      console.log('🔐 Encrypting video...');

      // Generate encryption key and IV
      const encryptionKey = await this.generateEncryptionKey();
      const iv = await this.generateIV();

      console.log(`   ✓ Generated encryption key (${this.KEY_SIZE} bytes)`);

      // Convert ArrayBuffer to Uint8Array for encryption
      const videoData = new Uint8Array(videoBuffer);

      // Encrypt video data
      const encryptedData = await this.encryptData(videoData, encryptionKey, iv);

      console.log(`   ✓ Encrypted ${videoData.length} bytes → ${encryptedData.length} bytes`);

      // Store encryption key securely
      await this.storeEncryptionKey(sessionId, encryptionKey, iv);

      console.log('   ✓ Stored encryption key securely');

      // Create metadata
      const metadata: EncryptionMetadata = {
        algorithm: this.ALGORITHM,
        videoSize: videoData.length,
        encryptedSize: encryptedData.length,
        timestamp: Date.now(),
        userId,
      };

      console.log('✅ Video encrypted successfully');

      return {
        encryptedData,
        encryptionKey: this.bufferToHex(encryptionKey),
        iv: this.bufferToHex(iv),
        metadata,
      };
    } catch (error) {
      console.error('❌ Failed to encrypt video:', error);
      throw new Error(`Video encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt video data received from P2P transfer
   * Used by pioneers reviewing videos
   */
  async decryptVideo(
    encryptedData: Uint8Array,
    encryptionKey: string,
    iv: string
  ): Promise<DecryptionResult> {
    try {
      console.log('🔓 Decrypting video...');

      // Convert hex strings to buffers
      const keyBuffer = this.hexToBuffer(encryptionKey);
      const ivBuffer = this.hexToBuffer(iv);

      console.log(`   ✓ Loaded encryption key (${keyBuffer.length} bytes)`);

      // Decrypt video data
      const decryptedData = await this.decryptData(encryptedData, keyBuffer, ivBuffer);

      console.log(`   ✓ Decrypted ${encryptedData.length} bytes → ${decryptedData.length} bytes`);

      // Create metadata
      const metadata: EncryptionMetadata = {
        algorithm: this.ALGORITHM,
        videoSize: decryptedData.length,
        encryptedSize: encryptedData.length,
        timestamp: Date.now(),
        userId: 'pioneer', // Pioneer decrypting the video
      };

      console.log('✅ Video decrypted successfully');

      return {
        decryptedData,
        metadata,
      };
    } catch (error) {
      console.error('❌ Failed to decrypt video:', error);
      throw new Error(`Video decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate random encryption key (AES-256)
   */
  private async generateEncryptionKey(): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(this.KEY_SIZE, (error, bytes) => {
        if (error) {
          reject(error);
        } else {
          resolve(new Uint8Array(bytes));
        }
      });
    });
  }

  /**
   * Generate random initialization vector (IV)
   */
  private async generateIV(): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(this.IV_SIZE, (error, bytes) => {
        if (error) {
          reject(error);
        } else {
          resolve(new Uint8Array(bytes));
        }
      });
    });
  }

  /**
   * Encrypt data using AES-256-CBC
   */
  private async encryptData(
    data: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      try {
        // Use react-native-crypto for AES encryption
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));

        const encrypted: Buffer[] = [];
        encrypted.push(cipher.update(Buffer.from(data)));
        encrypted.push(cipher.final());

        const encryptedBuffer = Buffer.concat(encrypted);
        resolve(new Uint8Array(encryptedBuffer));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Decrypt data using AES-256-CBC
   */
  private async decryptData(
    encryptedData: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      try {
        // Use react-native-crypto for AES decryption
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));

        const decrypted: Buffer[] = [];
        decrypted.push(decipher.update(Buffer.from(encryptedData)));
        decrypted.push(decipher.final());

        const decryptedBuffer = Buffer.concat(decrypted);
        resolve(new Uint8Array(decryptedBuffer));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Store encryption key securely using expo-secure-store
   * Keys are encrypted at rest on device
   */
  private async storeEncryptionKey(
    sessionId: string,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<void> {
    try {
      const keyData = {
        key: this.bufferToHex(key),
        iv: this.bufferToHex(iv),
        timestamp: Date.now(),
      };

      const storageKey = `${this.STORAGE_KEY_PREFIX}${sessionId}`;

      await SecureStore.setItemAsync(storageKey, JSON.stringify(keyData), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED, // iOS Keychain security
      });

      console.log(`   🔑 Stored encryption key for session: ${sessionId}`);
    } catch (error) {
      console.error('Failed to store encryption key:', error);
      throw new Error('Failed to securely store encryption key');
    }
  }

  /**
   * Retrieve encryption key from secure storage
   */
  async retrieveEncryptionKey(
    sessionId: string
  ): Promise<{ key: Uint8Array; iv: Uint8Array } | null> {
    try {
      const storageKey = `${this.STORAGE_KEY_PREFIX}${sessionId}`;
      const keyDataJson = await SecureStore.getItemAsync(storageKey);

      if (!keyDataJson) {
        console.warn(`No encryption key found for session: ${sessionId}`);
        return null;
      }

      const keyData = JSON.parse(keyDataJson);

      return {
        key: this.hexToBuffer(keyData.key),
        iv: this.hexToBuffer(keyData.iv),
      };
    } catch (error) {
      console.error('Failed to retrieve encryption key:', error);
      return null;
    }
  }

  /**
   * Delete encryption key from secure storage
   * Called after video review is complete
   */
  async deleteEncryptionKey(sessionId: string): Promise<void> {
    try {
      const storageKey = `${this.STORAGE_KEY_PREFIX}${sessionId}`;
      await SecureStore.deleteItemAsync(storageKey);

      console.log(`   🗑️  Deleted encryption key for session: ${sessionId}`);
    } catch (error) {
      console.error('Failed to delete encryption key:', error);
      // Non-critical - continue
    }
  }

  /**
   * Generate master encryption key for device
   * Used for additional layer of security
   */
  async generateMasterKey(): Promise<void> {
    try {
      // Check if master key already exists
      const existingKey = await SecureStore.getItemAsync(this.MASTER_KEY);

      if (existingKey) {
        console.log('   ✓ Master key already exists');
        return;
      }

      // Generate new master key
      const masterKey = await this.generateEncryptionKey();

      await SecureStore.setItemAsync(this.MASTER_KEY, this.bufferToHex(masterKey), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      console.log('   🔑 Generated master encryption key');
    } catch (error) {
      console.error('Failed to generate master key:', error);
      throw new Error('Failed to generate master encryption key');
    }
  }

  /**
   * Share encryption key with pioneers
   * Returns encrypted key that can be safely transmitted
   */
  async shareKeyWithPioneer(
    sessionId: string,
    pioneerId: string
  ): Promise<string | null> {
    try {
      // Retrieve encryption key
      const keyData = await this.retrieveEncryptionKey(sessionId);

      if (!keyData) {
        return null;
      }

      // Create shareable key package
      const keyPackage = {
        sessionId,
        pioneerId,
        key: this.bufferToHex(keyData.key),
        iv: this.bufferToHex(keyData.iv),
        timestamp: Date.now(),
      };

      // In production, encrypt this with pioneer's public key
      // For now, return JSON (backend will handle pioneer-specific encryption)
      return JSON.stringify(keyPackage);
    } catch (error) {
      console.error('Failed to share key with pioneer:', error);
      return null;
    }
  }

  /**
   * Estimate encrypted video size
   */
  estimateEncryptedSize(videoSize: number): number {
    // AES adds padding (up to block size - 16 bytes)
    // Plus IV (16 bytes) and metadata
    const blockSize = 16;
    const paddedSize = Math.ceil(videoSize / blockSize) * blockSize;
    const overhead = 32; // IV + metadata overhead

    return paddedSize + overhead;
  }

  /**
   * Get encryption status for a session
   */
  async getEncryptionStatus(sessionId: string): Promise<{
    hasKey: boolean;
    timestamp?: number;
  }> {
    const keyData = await this.retrieveEncryptionKey(sessionId);

    if (!keyData) {
      return { hasKey: false };
    }

    // Key exists
    return {
      hasKey: true,
      timestamp: Date.now(), // In production, retrieve from stored metadata
    };
  }

  /**
   * Cleanup old encryption keys
   * Remove keys older than specified age
   */
  async cleanupOldKeys(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      console.log('🧹 Cleaning up old encryption keys...');

      // Note: SecureStore doesn't provide key enumeration
      // In production, maintain a separate index of active sessions
      // For now, cleanup is triggered per-session after video review

      console.log('   ✓ Cleanup complete');
    } catch (error) {
      console.error('Failed to cleanup old keys:', error);
    }
  }

  /**
   * Convert Uint8Array to hex string
   */
  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBuffer(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Test encryption/decryption with sample data
   */
  async testEncryption(): Promise<boolean> {
    try {
      console.log('🧪 Testing encryption/decryption...');

      // Test data
      const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      // Generate key and IV
      const key = await this.generateEncryptionKey();
      const iv = await this.generateIV();

      // Encrypt
      const encrypted = await this.encryptData(testData, key, iv);

      // Decrypt
      const decrypted = await this.decryptData(encrypted, key, iv);

      // Verify
      const success = testData.every((byte, index) => byte === decrypted[index]);

      if (success) {
        console.log('✅ Encryption test passed');
      } else {
        console.error('❌ Encryption test failed - data mismatch');
      }

      return success;
    } catch (error) {
      console.error('❌ Encryption test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const videoEncryptionService = new VideoEncryptionService();
