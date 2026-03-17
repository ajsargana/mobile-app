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

// Vote on a block
export interface BlockVote {
  blockHeight: number;
  blockHash: string;
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
      validatorId: this.validatorId,
      validatorReputation: this.validatorReputation,
      timestamp: Date.now(),
      validationResult,
      signature: '', // Will be set below
    };

    // Sign the vote cryptographically
    vote.signature = await this.signVote(vote);

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
   * Sign a vote cryptographically
   */
  private async signVote(vote: BlockVote): Promise<string> {
    // Create vote hash
    const voteData = JSON.stringify({
      blockHeight: vote.blockHeight,
      blockHash: vote.blockHash,
      validatorId: vote.validatorId,
      timestamp: vote.timestamp,
      passed: vote.validationResult.passed,
    });

    // In production, use proper cryptographic signing (ECDSA, EdDSA)
    // For now, using simple hash-based signature
    const crypto = require('crypto-js');
    const signature = crypto.SHA256(voteData + this.validatorId).toString();

    return signature;
  }

  /**
   * Verify a vote signature
   */
  private async verifyVoteSignature(vote: BlockVote): Promise<boolean> {
    try {
      // Recreate vote data
      const voteData = JSON.stringify({
        blockHeight: vote.blockHeight,
        blockHash: vote.blockHash,
        validatorId: vote.validatorId,
        timestamp: vote.timestamp,
        passed: vote.validationResult.passed,
      });

      // Verify signature
      const crypto = require('crypto-js');
      const expectedSignature = crypto.SHA256(voteData + vote.validatorId).toString();

      return expectedSignature === vote.signature;
    } catch (error) {
      console.error('Error verifying vote signature:', error);
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
