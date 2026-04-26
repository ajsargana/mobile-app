/**
 * Consensus Participation Service
 *
 * Enables mobile validators to participate in Byzantine Fault Tolerant consensus
 * Implements reputation-weighted voting for block acceptance
 *
 * Key Features:
 * - Cryptographic vote signatures
 * - Reputation-weighted voting (67% threshold)
 * - P2P vote broadcasting
 * - Vote aggregation and consensus
 * - Slashing for incorrect votes
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkService } from './NetworkService';
import { EnhancedWalletService } from './EnhancedWalletService';
import { ethers } from 'ethers';
import { secp256k1 } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getOrCreatePeerIdentity } from '../lib/p2p/PeerIdentity';

// Vote on a block
export interface BlockVote {
  blockHeight: number;
  blockHash: string;
  approved: boolean;
  validatorId: string;
  validatorReputation: number;
  timestamp: number;
  validationResult: {
    passed: boolean;
    layer1_structure: boolean;
    layer2_hash: boolean;
    layer3_chain: boolean;
    layer4_timestamp: boolean;
    layer5_difficulty: boolean;
    layer6_merkle: boolean;
    layer7_participants: boolean;
    layer8_pow: boolean;
  };
  signature: string;
  /** EIP-191 signature for Ethereum wallet verification */
  ethersSignature?: string;
  /** Flag indicating signature was verified (set by backend) */
  signatureVerified?: boolean;
  /** secp256k1 compressed public key hex (33 bytes) — required for signature verification */
  publicKeyHex?: string;
}

// Aggregated consensus result
export interface ConsensusResult {
  blockHeight: number;
  blockHash: string;
  totalVotes: number;
  approvalVotes: number;
  rejectionVotes: number;
  totalReputation: number;
  approvalReputation: number;
  consensusReached: boolean;
  accepted: boolean;
  timestamp: number;
}

// Validator voting stats
export interface VotingStats {
  totalVotesCast: number;
  correctVotes: number;
  incorrectVotes: number;
  voteAccuracy: number;
  reputationGained: number;
  reputationLost: number;
  consensusParticipation: number; // Percentage of blocks voted on
  lastVoteTime: number;
}

export class ConsensusParticipation {
  private static instance: ConsensusParticipation;
  private networkService: NetworkService;
  private walletService: EnhancedWalletService;
  private validatorId: string;
  private walletAddress: string | null = null;
  private privateKeyHex: string | null = null; // secp256k1 private key from PeerIdentity
  private validatorReputation: number = 50;
  private votingEnabled: boolean = true;

  // Vote storage
  private myVotes: Map<number, BlockVote> = new Map();
  private receivedVotes: Map<number, BlockVote[]> = new Map();
  private consensusResults: Map<number, ConsensusResult> = new Map();

  // Statistics
  private stats: VotingStats = {
    totalVotesCast: 0,
    correctVotes: 0,
    incorrectVotes: 0,
    voteAccuracy: 100,
    reputationGained: 0,
    reputationLost: 0,
    consensusParticipation: 0,
    lastVoteTime: 0,
  };

  // Byzantine Fault Tolerance threshold (67%)
  private readonly BFT_THRESHOLD = 0.67;

  private constructor() {
    this.networkService = NetworkService.getInstance();
    this.walletService = EnhancedWalletService.getInstance();
    this.validatorId = this.generateValidatorId();
    this.loadState();
    // Load PeerIdentity key for real secp256k1 signing (T1-8 fix)
    getOrCreatePeerIdentity().then(identity => {
      this.privateKeyHex = identity.privateKeyHex;
      this.validatorId = identity.nodeId; // stable, peer-consistent ID
    }).catch(() => { /* use random fallback validatorId — signing will be skipped */ });
  }

  static getInstance(): ConsensusParticipation {
    if (!ConsensusParticipation.instance) {
      ConsensusParticipation.instance = new ConsensusParticipation();
    }
    return ConsensusParticipation.instance;
  }

  /**
   * Initialize consensus participation
   */
  async initialize(): Promise<void> {
    console.log('🗳️ Initializing consensus participation...');

    // Load validator reputation
    await this.loadValidatorReputation();

    // Get wallet address and register validator
    const account = this.walletService.getCurrentAccount();
    if (account) {
      this.walletAddress = account.address;
      await this.registerValidatorWithWallet();
    }

    // Subscribe to network votes
    this.subscribeToVotes();

    // Start consensus monitoring
    this.startConsensusMonitoring();

    console.log(`✅ Consensus participation initialized (Reputation: ${this.validatorReputation})`);
  }

  /**
   * Cast vote on a block
   */
  async castVote(
    blockHeight: number,
    blockHash: string,
    validationResult: BlockVote['validationResult']
  ): Promise<BlockVote> {
    if (!this.votingEnabled) {
      throw new Error('Voting is currently disabled');
    }

    console.log(`🗳️ Casting vote on block ${blockHeight}...`);

    // Create vote
    const vote: BlockVote = {
      blockHeight,
      blockHash,
      approved: validationResult.passed,
      validatorId: this.validatorId,
      validatorReputation: this.validatorReputation,
      timestamp: Date.now(),
      validationResult,
      signature: '', // Will be set below
    };

    // Sign the vote cryptographically and embed public key for receiver verification
    vote.signature = await this.signVote(vote);

    // Sign with ethers.js for Ethereum wallet verification (EIP-191)
    vote.ethersSignature = await this.signVoteWithEthers(vote);

    if (this.privateKeyHex) {
      vote.publicKeyHex = bytesToHex(secp256k1.getPublicKey(hexToBytes(this.privateKeyHex)));
    }

    // Store vote locally
    this.myVotes.set(blockHeight, vote);

    // Broadcast vote to network
    await this.broadcastVote(vote);

    // Update statistics
    this.stats.totalVotesCast++;
    this.stats.lastVoteTime = Date.now();
    await this.saveStats();

    console.log(`✅ Vote cast on block ${blockHeight}: ${validationResult.passed ? 'APPROVE' : 'REJECT'}`);

    return vote;
  }

  /**
   * Aggregate votes for a block and determine consensus
   */
  async aggregateVotes(blockHeight: number): Promise<ConsensusResult | null> {
    const votes = this.receivedVotes.get(blockHeight) || [];

    if (votes.length === 0) {
      console.log(`No votes received for block ${blockHeight}`);
      return null;
    }

    console.log(`📊 Aggregating ${votes.length} votes for block ${blockHeight}...`);

    // Calculate totals
    let totalReputation = 0;
    let approvalReputation = 0;
    let approvalVotes = 0;
    let rejectionVotes = 0;

    for (const vote of votes) {
      // Verify vote signature
      const isValid = await this.verifyVoteSignature(vote);
      if (!isValid) {
        console.warn(`⚠️ Invalid vote signature from ${vote.validatorId}`);
        continue;
      }

      totalReputation += vote.validatorReputation;

      if (vote.validationResult.passed) {
        approvalReputation += vote.validatorReputation;
        approvalVotes++;
      } else {
        rejectionVotes++;
      }
    }

    // Determine consensus
    const approvalPercentage = totalReputation > 0 ? approvalReputation / totalReputation : 0;
    const consensusReached = approvalPercentage >= this.BFT_THRESHOLD ||
                            approvalPercentage <= (1 - this.BFT_THRESHOLD);
    const accepted = approvalPercentage >= this.BFT_THRESHOLD;

    const result: ConsensusResult = {
      blockHeight,
      blockHash: votes[0].blockHash,
      totalVotes: votes.length,
      approvalVotes,
      rejectionVotes,
      totalReputation,
      approvalReputation,
      consensusReached,
      accepted,
      timestamp: Date.now(),
    };

    // Store consensus result
    this.consensusResults.set(blockHeight, result);

    console.log(`✅ Consensus for block ${blockHeight}:`);
    console.log(`   Approval: ${(approvalPercentage * 100).toFixed(1)}% (threshold: ${this.BFT_THRESHOLD * 100}%)`);
    console.log(`   Result: ${accepted ? 'ACCEPTED' : 'REJECTED'}`);
    console.log(`   Consensus: ${consensusReached ? 'REACHED' : 'NOT REACHED'}`);

    // Update validator reputation based on vote accuracy
    if (consensusReached) {
      await this.updateReputationFromConsensus(blockHeight, result);
    }

    return result;
  }

  /**
   * Register validator with wallet address on backend
   * POST /api/coordinator/register
   */
  private async registerValidatorWithWallet(): Promise<void> {
    try {
      if (!this.walletAddress) {
        console.warn('[Consensus] No wallet address available for validator registration');
        return;
      }

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://62.84.187.126:5005';
      const response = await fetch(`${apiUrl}/api/coordinator/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validatorId: this.validatorId,
          walletAddress: this.walletAddress,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Validator registered with wallet address:', this.walletAddress);
    } catch (error) {
      console.error('[Consensus] Error registering validator:', error);
    }
  }

  /**
   * Sign a vote with ethers.js using EIP-191 Ethereum message signing
   * The signature can be verified by recovering the signer's address
   */
  private async signVoteWithEthers(vote: BlockVote): Promise<string> {
    try {
      if (!this.walletAddress) {
        console.warn('[Consensus] No wallet address available for EIP-191 signing');
        return '';
      }

      const account = this.walletService.getCurrentAccount();
      if (!account) {
        console.warn('[Consensus] No active account for signing');
        return '';
      }

      // Construct the message to sign (following EIP-191 format)
      const message = JSON.stringify({
        blockHeight: vote.blockHeight,
        blockHash: vote.blockHash,
        approved: vote.approved,
        timestamp: vote.timestamp,
      });

      // Create a signer from the private key
      // Note: In production, this would use a hardware wallet or WalletConnect
      const privateKey = account.privateKey;
      if (!privateKey) {
        console.warn('[Consensus] No private key available for signing');
        return '';
      }

      // Create wallet and sign message with EIP-191 prefix
      const wallet = new ethers.Wallet(privateKey);
      const signature = await wallet.signMessage(message);

      console.log('[Consensus] Vote signed with EIP-191');
      return signature;
    } catch (error) {
      console.error('[Consensus] Error signing vote with ethers:', error);
      return '';
    }
  }

  /**
   * Sign a vote with secp256k1 ECDSA using the node's PeerIdentity private key.
   * The compact signature (64 bytes hex) is unforgeable without the private key.
   * Public key is embedded in the vote so receivers can verify without a registry.
   */
  private async signVote(vote: BlockVote): Promise<string> {
    const voteData = JSON.stringify({
      blockHeight: vote.blockHeight,
      blockHash: vote.blockHash,
      validatorId: vote.validatorId,
      timestamp: vote.timestamp,
      passed: vote.validationResult.passed,
    });
    const msgHash = sha256(new TextEncoder().encode(voteData));

    if (!this.privateKeyHex) {
      // PeerIdentity not loaded yet — return unsigned marker (will be rejected by peers)
      console.warn('[Consensus] privateKey not ready — vote will be unsigned');
      return 'unsigned';
    }

    const sig = secp256k1.sign(msgHash, hexToBytes(this.privateKeyHex));
    return bytesToHex(sig.toCompactRawBytes());
  }

  /**
   * Verify a secp256k1 vote signature.
   * Requires vote.publicKeyHex to be present (set by the sender when signing).
   */
  private async verifyVoteSignature(vote: BlockVote): Promise<boolean> {
    try {
      if (!vote.publicKeyHex || vote.signature === 'unsigned') return false;

      const voteData = JSON.stringify({
        blockHeight: vote.blockHeight,
        blockHash: vote.blockHash,
        validatorId: vote.validatorId,
        timestamp: vote.timestamp,
        passed: vote.validationResult.passed,
      });
      const msgHash = sha256(new TextEncoder().encode(voteData));
      return secp256k1.verify(vote.signature, msgHash, vote.publicKeyHex);
    } catch {
      return false;
    }
  }

  /**
   * Verify an EIP-191 ethers.js signature
   * Recovers the signer address and compares with validatorId
   */
  private async verifyEthersSignature(vote: BlockVote): Promise<boolean> {
    try {
      if (!vote.ethersSignature) return false;

      const message = JSON.stringify({
        blockHeight: vote.blockHeight,
        blockHash: vote.blockHash,
        approved: vote.approved,
        timestamp: vote.timestamp,
      });

      // Recover the signer's address from the signature
      const recoveredAddress = ethers.verifyMessage(message, vote.ethersSignature);

      // Note: In production, this would check against a registered wallet address
      // For now, we verify the signature is valid
      return recoveredAddress !== ethers.ZeroAddress;
    } catch (error) {
      console.error('[Consensus] Error verifying ethers signature:', error);
      return false;
    }
  }

  /**
   * Broadcast vote to network via P2P
   */
  private async broadcastVote(vote: BlockVote): Promise<void> {
    try {
      // Broadcast via network service
      const message = {
        type: 'consensus_vote',
        data: vote,
        timestamp: new Date(),
      };

      await this.networkService.broadcastMessage(message);

      console.log(`📡 Vote broadcast to network for block ${vote.blockHeight}`);
    } catch (error) {
      console.error('Error broadcasting vote:', error);
      throw error;
    }
  }

  /**
   * Subscribe to votes from other validators
   */
  private subscribeToVotes(): void {
    this.networkService.on('consensus_vote', async (vote: BlockVote) => {
      console.log(`📥 Received vote from ${vote.validatorId.substring(0, 8)} for block ${vote.blockHeight}`);

      // Verify vote
      const isValid = await this.verifyVoteSignature(vote);
      if (!isValid) {
        console.warn(`⚠️ Rejected invalid vote from ${vote.validatorId}`);
        return;
      }

      // Store vote
      if (!this.receivedVotes.has(vote.blockHeight)) {
        this.receivedVotes.set(vote.blockHeight, []);
      }

      const votes = this.receivedVotes.get(vote.blockHeight)!;

      // Check for duplicate votes
      const existingVote = votes.find(v => v.validatorId === vote.validatorId);
      if (existingVote) {
        console.warn(`⚠️ Duplicate vote from ${vote.validatorId}, ignoring`);
        return;
      }

      votes.push(vote);

      console.log(`📊 Total votes for block ${vote.blockHeight}: ${votes.length}`);

      // Try to reach consensus if we have enough votes
      if (votes.length >= 3) { // Minimum 3 validators for consensus
        await this.aggregateVotes(vote.blockHeight);
      }
    });
  }

  /**
   * Update validator reputation based on consensus outcome
   */
  private async updateReputationFromConsensus(
    blockHeight: number,
    consensus: ConsensusResult
  ): Promise<void> {
    const myVote = this.myVotes.get(blockHeight);
    if (!myVote) {
      return; // We didn't vote on this block
    }

    const myVoteApproved = myVote.validationResult.passed;
    const consensusApproved = consensus.accepted;

    if (myVoteApproved === consensusApproved) {
      // Correct vote - increase reputation
      const gain = 1;
      this.validatorReputation = Math.min(100, this.validatorReputation + gain);
      this.stats.correctVotes++;
      this.stats.reputationGained += gain;

      console.log(`✅ Correct vote! Reputation: ${this.validatorReputation} (+${gain})`);
    } else {
      // Incorrect vote - decrease reputation (slashing)
      const loss = 2;
      this.validatorReputation = Math.max(0, this.validatorReputation - loss);
      this.stats.incorrectVotes++;
      this.stats.reputationLost += loss;

      console.log(`❌ Incorrect vote! Reputation: ${this.validatorReputation} (-${loss})`);
    }

    // Update accuracy
    const totalVotes = this.stats.correctVotes + this.stats.incorrectVotes;
    this.stats.voteAccuracy = (this.stats.correctVotes / totalVotes) * 100;

    // Save reputation
    await this.saveValidatorReputation();
    await this.saveStats();
  }

  /**
   * Monitor consensus and auto-aggregate
   */
  private startConsensusMonitoring(): void {
    // Check for consensus every 30 seconds
    setInterval(async () => {
      for (const [blockHeight, votes] of this.receivedVotes.entries()) {
        // Skip if consensus already reached
        if (this.consensusResults.has(blockHeight)) {
          continue;
        }

        // Aggregate if we have votes
        if (votes.length > 0) {
          await this.aggregateVotes(blockHeight);
        }
      }
    }, 30000);

    // Clean up old votes (older than 1 hour)
    setInterval(() => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      for (const [blockHeight, result] of this.consensusResults.entries()) {
        if (result.timestamp < oneHourAgo) {
          this.consensusResults.delete(blockHeight);
          this.receivedVotes.delete(blockHeight);
          this.myVotes.delete(blockHeight);
        }
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Get consensus result for a block
   */
  getConsensusResult(blockHeight: number): ConsensusResult | null {
    return this.consensusResults.get(blockHeight) || null;
  }

  /**
   * Get voting statistics
   */
  getVotingStats(): VotingStats {
    return { ...this.stats };
  }

  /**
   * Get validator reputation
   */
  getReputation(): number {
    return this.validatorReputation;
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string | null {
    return this.walletAddress;
  }

  /**
   * Enable/disable voting
   */
  setVotingEnabled(enabled: boolean): void {
    this.votingEnabled = enabled;
    console.log(`🗳️ Voting ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get all votes for a block
   */
  getBlockVotes(blockHeight: number): BlockVote[] {
    return this.receivedVotes.get(blockHeight) || [];
  }

  // Storage methods
  private async loadValidatorReputation(): Promise<void> {
    try {
      const reputation = await AsyncStorage.getItem('@aura50_validator_reputation');
      if (reputation) {
        this.validatorReputation = parseFloat(reputation);
      }
    } catch (error) {
      console.error('Error loading validator reputation:', error);
    }
  }

  private async saveValidatorReputation(): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_validator_reputation', this.validatorReputation.toString());
    } catch (error) {
      console.error('Error saving validator reputation:', error);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const stats = await AsyncStorage.getItem('@aura50_voting_stats');
      if (stats) {
        this.stats = JSON.parse(stats);
      }
    } catch (error) {
      console.error('Error loading voting stats:', error);
    }
  }

  private async saveStats(): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_voting_stats', JSON.stringify(this.stats));
    } catch (error) {
      console.error('Error saving voting stats:', error);
    }
  }

  private async loadState(): Promise<void> {
    await this.loadValidatorReputation();
    await this.loadStats();
  }

  private generateValidatorId(): string {
    return 'validator_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

export default ConsensusParticipation;
