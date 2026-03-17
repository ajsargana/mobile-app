import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Linking,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import SecurityCircleService from '../services/SecurityCircleService';
import { EnhancedWalletService } from '../services/EnhancedWalletService';

interface SecurityCircleScreenProps {
  navigation: any;
}

interface CircleProgress {
  invited: number;
  registered: number;
  active: number;
  walletStatus: 'locked' | 'unlocked';
  requirements: string;
}

interface InviteLink {
  inviteCode: string;
  inviterId: string;
  createdAt: string;
  isUsed: boolean;
}

interface CircleMember {
  id: string;
  username?: string;
  invitedAt: string;
  isActive: boolean;
  status: string;
}

export function SecurityCircleScreen({ navigation }: SecurityCircleScreenProps) {
  const [progress, setProgress] = useState<CircleProgress>({
    invited: 0,
    registered: 0,
    active: 0,
    walletStatus: 'locked',
    requirements: 'Loading...'
  });

  const [members, setMembers] = useState<CircleMember[]>([]);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);

  const securityCircleService = SecurityCircleService.getInstance();
  const walletService = EnhancedWalletService.getInstance();

  useEffect(() => {
    loadCircleData();
  }, []);

  const loadCircleData = async () => {
    try {
      const user = walletService.getUser();
      if (!user) return;

      // Get circle progress
      const circleProgress = await securityCircleService.getCircleProgress(user.id);
      setProgress(circleProgress);

      // Get circle status
      const circleStatus = await securityCircleService.getSecurityCircleStatus(user.id);
      if (circleStatus) {
        setMembers(circleStatus.members);
      }

      // Get pending invites
      const pendingInvites = await securityCircleService.getPendingInvites(user.id);
      setInviteLinks(pendingInvites);

    } catch (error) {
      console.error('Failed to load circle data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCircleData();
    setRefreshing(false);
  };

  const generateInviteLink = async () => {
    try {
      setIsGeneratingInvite(true);
      const user = walletService.getUser();
      if (!user) throw new Error('User not authenticated');

      const inviteLink = await securityCircleService.generateInviteLink(user.id);

      Alert.alert(
        '🔗 Referral Code Ready',
        `Your referral code: ${inviteLink.inviteCode}\n\nShare this with someone you trust. They need to enter it when registering.`,
        [
          { text: 'Copy Code', onPress: () => copyInviteLink(inviteLink.inviteCode) },
          { text: 'Share Now', onPress: () => shareInviteLink(inviteLink.inviteCode) },
          { text: 'Show QR Code', onPress: () => setShowQRCode(inviteLink.inviteCode) }
        ]
      );

      await loadCircleData(); // Refresh data

    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const copyInviteLink = async (inviteCode: string) => {
    // Copy just the referral code (not a URL) so new users can paste it directly
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert('✅ Copied!', `Referral code "${inviteCode}" copied to clipboard`);
  };

  const shareInviteLink = async (inviteCode: string) => {
    const message = `🚀 Join AURA5O - the world's first mobile blockchain!\n\nUse my referral code when you sign up: ${inviteCode}\n\n✨ Join the network on your phone and earn A50 tokens!`;

    try {
      await Share.share({
        message,
        title: 'Join My AURA5O Security Circle'
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const openInviteInstructions = () => {
    Alert.alert(
      '🛡️ Security Circle Instructions',
      '1. Generate invite links for people you trust\n\n' +
      '2. They must register and complete their FIRST MINING session\n\n' +
      '3. Once all 3 invites are active, your wallet unlocks\n\n' +
      '4. If someone invited you, they must also mine first\n\n' +
      '⚠️ Choose trusted people - this protects against fake accounts!',
      [{ text: 'Got it!' }]
    );
  };

  const getStatusColor = (status: 'locked' | 'unlocked') => {
    return status === 'unlocked' ? '#10B981' : '#EF4444';
  };

  const getStatusIcon = (status: 'locked' | 'unlocked') => {
    return status === 'unlocked' ? 'checkmark-circle' : 'lock-closed';
  };

  const getMemberStatusIcon = (isActive: boolean) => {
    return isActive ? 'checkmark-circle' : 'time-outline';
  };

  const getMemberStatusColor = (isActive: boolean) => {
    return isActive ? '#10B981' : '#F59E0B';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={32} color="#667eea" />
        </View>
        <Text style={styles.headerTitle}>Security Circle</Text>
        <Text style={styles.headerSubtitle}>
          Invite 3 trusted people to unlock your wallet
        </Text>
      </View>

      {/* Wallet Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Ionicons
            name={getStatusIcon(progress.walletStatus)}
            size={24}
            color={getStatusColor(progress.walletStatus)}
          />
          <Text style={[styles.statusTitle, { color: getStatusColor(progress.walletStatus) }]}>
            Wallet {progress.walletStatus === 'unlocked' ? 'UNLOCKED' : 'LOCKED'}
          </Text>
        </View>

        {progress.walletStatus === 'locked' && (
          <Text style={styles.statusDescription}>
            Complete your Security Circle to unlock wallet transactions
          </Text>
        )}

        {progress.walletStatus === 'unlocked' && (
          <Text style={styles.statusDescription}>
            🎉 Your Security Circle is complete! You can now make transactions.
          </Text>
        )}
      </View>

      {/* Progress Card */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Circle Progress</Text>
          <TouchableOpacity onPress={openInviteInstructions}>
            <Ionicons name="information-circle-outline" size={20} color="#667eea" />
          </TouchableOpacity>
        </View>

        <View style={styles.progressStats}>
          <View style={styles.progressStat}>
            <Text style={styles.progressNumber}>{progress.invited}/3</Text>
            <Text style={styles.progressLabel}>Invited</Text>
          </View>

          <View style={styles.progressStat}>
            <Text style={styles.progressNumber}>{progress.registered}/3</Text>
            <Text style={styles.progressLabel}>Registered</Text>
          </View>

          <View style={styles.progressStat}>
            <Text style={[styles.progressNumber, { color: '#10B981' }]}>{progress.active}/3</Text>
            <Text style={styles.progressLabel}>Active</Text>
          </View>
        </View>

        <Text style={styles.requirements}>{progress.requirements}</Text>
      </View>

      {/* Generate Invite Button */}
      {progress.invited < 3 && (
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={generateInviteLink}
          disabled={isGeneratingInvite}
        >
          <Ionicons name="person-add" size={20} color="white" />
          <Text style={styles.inviteButtonText}>
            {isGeneratingInvite ? 'Generating...' : 'Generate Invite Link'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Pending Invites */}
      {inviteLinks.length > 0 && (
        <View style={styles.invitesCard}>
          <Text style={styles.invitesTitle}>📤 Your Invite Links</Text>
          {inviteLinks.map((invite, index) => (
            <View key={index} style={styles.inviteItem}>
              <View style={styles.inviteInfo}>
                <Text style={styles.inviteCode}>{invite.inviteCode}</Text>
                <Text style={styles.inviteDate}>
                  Created: {new Date(invite.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  onPress={() => copyInviteLink(invite.inviteCode)}
                  style={styles.actionButton}
                >
                  <Ionicons name="copy-outline" size={16} color="#667eea" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => shareInviteLink(invite.inviteCode)}
                  style={styles.actionButton}
                >
                  <Ionicons name="share-outline" size={16} color="#667eea" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowQRCode(invite.inviteCode)}
                  style={styles.actionButton}
                >
                  <Ionicons name="qr-code-outline" size={16} color="#667eea" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Circle Members */}
      {members.length > 0 && (
        <View style={styles.membersCard}>
          <Text style={styles.membersTitle}>👥 Circle Members</Text>
          {members.map((member, index) => (
            <View key={index} style={styles.memberItem}>
              <View style={styles.memberInfo}>
                <Ionicons
                  name={getMemberStatusIcon(member.isActive)}
                  size={20}
                  color={getMemberStatusColor(member.isActive)}
                />
                <View style={styles.memberDetails}>
                  <Text style={styles.memberName}>
                    {member.username || `User ${member.id.slice(0, 8)}`}
                  </Text>
                  <Text style={styles.memberStatus}>
                    {member.isActive ? '✅ Active' : '⏳ Waiting to participate'}
                  </Text>
                </View>
              </View>
              <Text style={styles.memberDate}>
                Invited: {new Date(member.invitedAt).toLocaleDateString()}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* QR Code Modal */}
      {showQRCode && (
        <View style={styles.qrModal}>
          <View style={styles.qrModalContent}>
            <Text style={styles.qrTitle}>Share QR Code</Text>
            <View style={styles.qrCodeContainer}>
              <QRCode
                value={showQRCode}
                size={200}
                backgroundColor="white"
                color="#1F2937"
              />
            </View>
            <Text style={styles.qrSubtitle}>Have them scan or enter this code</Text>
            <Text style={styles.qrCode}>Referral Code: {showQRCode}</Text>
            <TouchableOpacity
              style={styles.qrCloseButton}
              onPress={() => setShowQRCode(null)}
            >
              <Text style={styles.qrCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Security Notice */}
      <View style={styles.securityNotice}>
        <Ionicons name="shield-outline" size={16} color="#6B7280" />
        <Text style={styles.securityText}>
          Security Circles prevent fake accounts and ensure only real people join AURA5O
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerIcon: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  statusDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  progressCard: {
    backgroundColor: 'white',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  progressStat: {
    alignItems: 'center',
  },
  progressNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
  },
  progressLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  requirements: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  inviteButton: {
    backgroundColor: '#667eea',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
  },
  inviteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  invitesCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  invitesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  inviteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  inviteInfo: {
    flex: 1,
  },
  inviteCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
    fontFamily: 'monospace',
  },
  inviteDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  inviteActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  membersCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  membersTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  memberItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  memberDetails: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  memberStatus: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  memberDate: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
  },
  qrModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    margin: 20,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  qrCodeContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 16,
  },
  qrSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  qrCode: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6B7280',
    marginBottom: 16,
  },
  qrCloseButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  qrCloseButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  securityText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },
});

export default SecurityCircleScreen;