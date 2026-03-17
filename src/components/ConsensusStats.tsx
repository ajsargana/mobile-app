/**
 * Consensus Stats Component
 *
 * Displays mobile validator consensus participation statistics
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { ConsensusParticipation, VotingStats } from '../services/ConsensusParticipation';

export const ConsensusStats: React.FC = () => {
  const [stats, setStats] = useState<VotingStats | null>(null);
  const [reputation, setReputation] = useState<number>(50);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    // Refresh stats every 10 seconds
    const interval = setInterval(loadStats, 10000);

    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const consensus = ConsensusParticipation.getInstance();
      const votingStats = consensus.getVotingStats();
      const rep = consensus.getReputation();

      setStats(votingStats);
      setReputation(rep);
      setLoading(false);
    } catch (error) {
      console.error('Error loading consensus stats:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No consensus data available</Text>
      </View>
    );
  }

  const getReputationColor = (rep: number): string => {
    if (rep >= 75) return '#4CAF50'; // Green
    if (rep >= 50) return '#FFC107'; // Yellow
    if (rep >= 25) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  const getReputationLabel = (rep: number): string => {
    if (rep >= 90) return 'Excellent';
    if (rep >= 75) return 'Good';
    if (rep >= 50) return 'Fair';
    if (rep >= 25) return 'Poor';
    return 'Critical';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🗳️ Consensus Participation</Text>

      {/* Reputation Score */}
      <View style={styles.reputationCard}>
        <Text style={styles.reputationLabel}>Validator Reputation</Text>
        <View style={styles.reputationRow}>
          <View style={styles.reputationBarContainer}>
            <View
              style={[
                styles.reputationBar,
                {
                  width: `${reputation}%`,
                  backgroundColor: getReputationColor(reputation),
                },
              ]}
            />
          </View>
          <Text style={[styles.reputationScore, { color: getReputationColor(reputation) }]}>
            {reputation}/100
          </Text>
        </View>
        <Text style={styles.reputationStatus}>{getReputationLabel(reputation)}</Text>
      </View>

      {/* Voting Statistics */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalVotesCast}</Text>
          <Text style={styles.statLabel}>Total Votes</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.voteAccuracy.toFixed(1)}%</Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.correctVotes}</Text>
          <Text style={styles.statLabel}>Correct</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#F44336' }]}>{stats.incorrectVotes}</Text>
          <Text style={styles.statLabel}>Incorrect</Text>
        </View>
      </View>

      {/* Participation Rate */}
      <View style={styles.participationCard}>
        <Text style={styles.participationLabel}>Consensus Participation</Text>
        <Text style={styles.participationValue}>
          {stats.consensusParticipation.toFixed(1)}%
        </Text>
        <Text style={styles.participationHint}>
          Percentage of blocks you voted on
        </Text>
      </View>

      {/* Reputation Changes */}
      <View style={styles.reputationChanges}>
        <View style={styles.changeRow}>
          <Text style={styles.changeLabel}>Reputation Gained:</Text>
          <Text style={[styles.changeValue, { color: '#4CAF50' }]}>
            +{stats.reputationGained}
          </Text>
        </View>
        <View style={styles.changeRow}>
          <Text style={styles.changeLabel}>Reputation Lost:</Text>
          <Text style={[styles.changeValue, { color: '#F44336' }]}>
            -{stats.reputationLost}
          </Text>
        </View>
      </View>

      {/* Status Indicator */}
      <View style={styles.statusCard}>
        {stats.lastVoteTime > 0 ? (
          <>
            <Text style={styles.statusIndicator}>● </Text>
            <Text style={styles.statusText}>
              Actively Participating in Consensus
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.statusIndicator, { color: '#999' }]}>○ </Text>
            <Text style={[styles.statusText, { color: '#999' }]}>
              Not Yet Participating
            </Text>
          </>
        )}
      </View>

      {/* Help Text */}
      <Text style={styles.helpText}>
        Earn reputation by voting correctly on block validity.
        Higher reputation = higher credit multipliers.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },

  // Reputation Card
  reputationCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
  },
  reputationLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  reputationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reputationBarContainer: {
    flex: 1,
    height: 24,
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  reputationBar: {
    height: '100%',
    borderRadius: 12,
  },
  reputationScore: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'right',
  },
  reputationStatus: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },

  // Participation Card
  participationCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 2,
  },
  participationLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  participationValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 4,
  },
  participationHint: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },

  // Reputation Changes
  reputationChanges: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  changeLabel: {
    fontSize: 14,
    color: '#666',
  },
  changeValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Status Card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
  },
  statusIndicator: {
    fontSize: 20,
    color: '#4CAF50',
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },

  // Help Text
  helpText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default ConsensusStats;
