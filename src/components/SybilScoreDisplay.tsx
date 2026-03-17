/**
 * Sybil Score Display Component
 *
 * Shows validator's Sybil resistance score and security status
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MobileNodeService } from '../services/MobileNodeService';
import { SybilScore, DeviceAttestation } from '../services/SybilResistanceService';

export const SybilScoreDisplay: React.FC = () => {
  const [score, setScore] = useState<SybilScore | null>(null);
  const [attestation, setAttestation] = useState<DeviceAttestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [reatesting, setReatesting] = useState(false);

  useEffect(() => {
    loadScoreData();

    // Refresh every 30 seconds
    const interval = setInterval(loadScoreData, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadScoreData = async () => {
    try {
      const nodeService = MobileNodeService.getInstance();
      const currentScore = await nodeService.getSybilScore();
      const currentAttestation = await nodeService.getDeviceAttestation();

      setScore(currentScore);
      setAttestation(currentAttestation);
      setLoading(false);
    } catch (error) {
      console.error('Error loading Sybil score:', error);
      setLoading(false);
    }
  };

  const handleRetest = async () => {
    try {
      setReatesting(true);
      const nodeService = MobileNodeService.getInstance();
      await nodeService.reattestDevice();
      await loadScoreData();
      Alert.alert('Success', 'Device re-attestation complete');
    } catch (error) {
      console.error('Error re-attesting device:', error);
      Alert.alert('Error', 'Failed to re-attest device');
    } finally {
      setReatesting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading security score...</Text>
      </View>
    );
  }

  if (!score || !attestation) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Security score unavailable</Text>
      </View>
    );
  }

  const getRiskColor = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'low': return '#4CAF50';
      case 'medium': return '#FFC107';
      case 'high': return '#FF9800';
      case 'critical': return '#F44336';
      default: return '#999';
    }
  };

  const getRiskIcon = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'low': return '✅';
      case 'medium': return '⚠️';
      case 'high': return '🚨';
      case 'critical': return '❌';
      default: return '❓';
    }
  };

  const getScoreGrade = (score: number): string => {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛡️ Security Score</Text>

      {/* Overall Score */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreLabel}>Overall Score</Text>
          <Text style={styles.scoreGrade}>{getScoreGrade(score.overallScore)}</Text>
        </View>

        <View style={styles.scoreCircle}>
          <Text style={styles.scoreValue}>{score.overallScore}</Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>

        <View style={styles.riskBadge}>
          <Text style={[styles.riskText, { color: getRiskColor(score.riskLevel) }]}>
            {getRiskIcon(score.riskLevel)} {score.riskLevel.toUpperCase()} RISK
          </Text>
        </View>

        <View style={styles.validationStatus}>
          {score.canValidate ? (
            <Text style={styles.canValidateText}>✅ Eligible to Validate</Text>
          ) : (
            <Text style={styles.cannotValidateText}>❌ Not Eligible to Validate</Text>
          )}
        </View>
      </View>

      {/* Factor Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score Breakdown</Text>

        <View style={styles.factorList}>
          <FactorBar
            label="Device Attestation"
            score={score.factors.deviceAttestation}
            weight={30}
            icon={attestation.verified ? '✅' : '⚠️'}
          />
          <FactorBar
            label="SIM Verification"
            score={score.factors.simVerification}
            weight={25}
            icon={score.factors.simVerification === 100 ? '✅' : '❌'}
          />
          <FactorBar
            label="Contribution Proof"
            score={score.factors.miningProof}
            weight={20}
            icon="⚡"
          />
          <FactorBar
            label="Behavioral Analysis"
            score={score.factors.behavioralAnalysis}
            weight={15}
            icon="🤖"
          />
          <FactorBar
            label="Account Age"
            score={score.factors.accountAge}
            weight={10}
            icon="📅"
          />
        </View>
      </View>

      {/* Device Attestation Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Attestation</Text>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device Type:</Text>
            <Text style={styles.detailValue}>
              {attestation.isRealDevice ? '📱 Real Device' : '⚠️ Emulator'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Platform:</Text>
            <Text style={styles.detailValue}>{attestation.platform.toUpperCase()}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Verified:</Text>
            <Text style={styles.detailValue}>
              {attestation.verified ? '✅ Yes' : '❌ No'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last Checked:</Text>
            <Text style={styles.detailValue}>
              {new Date(attestation.timestamp).toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.retestButton, reatesting && styles.retestButtonDisabled]}
        onPress={handleRetest}
        disabled={reatesting}
      >
        {reatesting ? (
          <>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.retestButtonText}>Re-testing...</Text>
          </>
        ) : (
          <Text style={styles.retestButtonText}>🔄 Re-attest Device</Text>
        )}
      </TouchableOpacity>

      {/* Help Text */}
      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>💡 How to Improve Your Score</Text>
        <Text style={styles.helpText}>
          • Verify your SIM card (+25 points)
        </Text>
        <Text style={styles.helpText}>
          • Mine regularly to prove real device (+20 points)
        </Text>
        <Text style={styles.helpText}>
          • Use the app naturally (avoid bot-like patterns)
        </Text>
        <Text style={styles.helpText}>
          • Keep your account active over time (+10 points)
        </Text>
        <Text style={styles.helpText}>
          • Ensure device attestation passes (+30 points)
        </Text>
      </View>
    </View>
  );
};

interface FactorBarProps {
  label: string;
  score: number;
  weight: number;
  icon: string;
}

const FactorBar: React.FC<FactorBarProps> = ({ label, score, weight, icon }) => {
  const getBarColor = (score: number): string => {
    if (score >= 75) return '#4CAF50';
    if (score >= 50) return '#FFC107';
    if (score >= 25) return '#FF9800';
    return '#F44336';
  };

  return (
    <View style={styles.factorItem}>
      <View style={styles.factorHeader}>
        <Text style={styles.factorIcon}>{icon}</Text>
        <Text style={styles.factorLabel}>{label}</Text>
        <Text style={styles.factorWeight}>({weight}%)</Text>
      </View>

      <View style={styles.factorBarContainer}>
        <View
          style={[
            styles.factorBar,
            { width: `${score}%`, backgroundColor: getBarColor(score) },
          ]}
        />
      </View>

      <Text style={styles.factorScore}>{score}/100</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    padding: 20,
    textAlign: 'center',
    backgroundColor: '#fff',
  },

  // Score Card
  scoreCard: {
    backgroundColor: '#fff',
    padding: 24,
    margin: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  scoreLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  scoreGrade: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 8,
    borderColor: '#4A90E2',
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  scoreMax: {
    fontSize: 16,
    color: '#666',
    marginTop: -8,
  },
  riskBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f9f9f9',
    marginVertical: 12,
  },
  riskText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  validationStatus: {
    marginTop: 12,
  },
  canValidateText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },
  cannotValidateText: {
    fontSize: 16,
    color: '#F44336',
    fontWeight: '600',
  },

  // Sections
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },

  // Factor List
  factorList: {
    gap: 16,
  },
  factorItem: {
    marginBottom: 12,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  factorIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  factorLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    fontWeight: '500',
  },
  factorWeight: {
    fontSize: 12,
    color: '#999',
  },
  factorBarContainer: {
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  factorBar: {
    height: '100%',
    borderRadius: 4,
  },
  factorScore: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },

  // Details Card
  detailsCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },

  // Retest Button
  retestButton: {
    backgroundColor: '#4A90E2',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  retestButtonDisabled: {
    backgroundColor: '#999',
  },
  retestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Help Section
  helpSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    marginVertical: 2,
  },
});

export default SybilScoreDisplay;
