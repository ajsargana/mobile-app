import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Dimensions,
  Image,
  RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import MobileReferralService, { MobileReferralData } from '../services/MobileReferralService';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

const { width } = Dimensions.get('window');

interface MobileReferralScreenProps {
  navigation: any;
}

export const MobileReferralScreen: React.FC<MobileReferralScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [referralService] = useState(() => MobileReferralService.getInstance());
  const [referralData, setReferralData] = useState<MobileReferralData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'share' | 'qr' | 'stats'>('share');
  const [qrImages, setQrImages] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadReferralData();
    integrateWithNodeSystem();
  }, []);

  const loadReferralData = async () => {
    try {
      setIsLoading(true);
      const data = await referralService.getMobileReferralData();
      setReferralData(data);

      const images: { [key: string]: string } = {};
      for (const qr of data.qrCodes) {
        try {
          images[qr.type] = qr.imageUrl;
        } catch (error) {
          console.error(`Failed to load QR code for ${qr.type}:`, error);
        }
      }
      setQrImages(images);

    } catch (error) {
      console.error('Failed to load network data:', error);
      Alert.alert('Error', 'Failed to load network data');
    } finally {
      setIsLoading(false);
    }
  };

  const integrateWithNodeSystem = async () => {
    try {
      await referralService.integrateWithMobileNode();
    } catch (error) {
      console.error('Failed to integrate with node system:', error);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadReferralData();
    setIsRefreshing(false);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied!', `${label} copied to clipboard`);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const shareViaApp = async (platform: string) => {
    try {
      if (!referralData) return;

      const shareData = referralData.socialSharing.find(s => s.platform === platform);
      if (!shareData) {
        Alert.alert('Error', `${platform} sharing not available`);
        return;
      }

      // Try to open the app directly
      const canOpen = await Linking.canOpenURL(shareData.url);
      if (canOpen) {
        await Linking.openURL(shareData.url);
      } else {
        // Fallback to native sharing
        await Share.share({
          message: shareData.message,
          url: shareData.deepLink || shareData.url,
          title: shareData.title
        });
      }

      // Track the share
      await referralService.shareReferral(platform);

    } catch (error) {
      console.error(`Failed to share via ${platform}:`, error);
      Alert.alert('Error', `Failed to share via ${platform}`);
    }
  };

  const shareGeneric = async () => {
    try {
      if (!referralData) return;

      const message = `🚀 Join AURA5O - the world's first mobile-native blockchain!

📱 Contribute to the network on your phone
💰 Earn A50 tokens
🏆 Build trust over time
🌍 Works on 2G networks

Use my referral code: ${referralData.referralCode}

Download: ${referralData.deepLinks[1]}`;

      await Share.share({
        message,
        title: 'Join AURA5O Mobile Blockchain',
      });

    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const getTrustLevelInfo = (multiplier: number) => {
    if (multiplier >= 3.0) return { level: 'Legend', color: '#FFD700', icon: '👑' };
    if (multiplier >= 2.0) return { level: 'Veteran', color: '#9B59B6', icon: '⭐' };
    if (multiplier >= 1.5) return { level: 'Established', color: '#3498DB', icon: '🏆' };
    return { level: 'New', color: '#95A5A6', icon: '🌱' };
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <Text style={styles.loadingText}>Loading Referral System...</Text>
      </View>
    );
  }

  if (!referralData) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.bg }]}>
        <Text style={styles.errorText}>Failed to load referral data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadReferralData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const trustInfo = getTrustLevelInfo(referralData.trustMultiplier);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Ionicons name="people-outline" size={48} color="#FFF" />
          <Text style={styles.headerTitle}>Mobile-First Referrals</Text>
          <Text style={styles.headerSubtitle}>
            Share AURA5O and earn with trust multipliers
          </Text>
        </View>

        {/* Trust Level Display */}
        <View style={styles.trustContainer}>
          <View style={[styles.trustBadge, { backgroundColor: trustInfo.color }]}>
            <Text style={styles.trustEmoji}>{trustInfo.icon}</Text>
            <Text style={styles.trustText}>{trustInfo.level}</Text>
          </View>
          <Text style={styles.trustMultiplier}>
            {referralData.trustMultiplier.toFixed(1)}x Bonus
          </Text>
        </View>
      </LinearGradient>

      {/* Stats Overview */}
      <ThemedCard style={styles.statsContainer} padding={20}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{referralData.totalReferrals}</Text>
          <Text style={styles.statLabel}>Total Referrals</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{parseFloat(referralData.totalEarnings).toFixed(2)}</Text>
          <Text style={styles.statLabel}>A50 Earned</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{(referralData.trustMultiplier * 100).toFixed(0)}%</Text>
          <Text style={styles.statLabel}>Trust Bonus</Text>
        </View>
      </ThemedCard>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'share' && styles.activeTab]}
          onPress={() => setActiveTab('share')}
        >
          <Ionicons name="share-outline" size={20} color={activeTab === 'share' ? '#667eea' : '#7F8C8D'} />
          <Text style={[styles.tabText, activeTab === 'share' && styles.activeTabText]}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'qr' && styles.activeTab]}
          onPress={() => setActiveTab('qr')}
        >
          <Ionicons name="qr-code-outline" size={20} color={activeTab === 'qr' ? '#667eea' : '#7F8C8D'} />
          <Text style={[styles.tabText, activeTab === 'qr' && styles.activeTabText]}>QR Codes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.activeTab]}
          onPress={() => setActiveTab('stats')}
        >
          <Ionicons name="analytics-outline" size={20} color={activeTab === 'stats' ? '#667eea' : '#7F8C8D'} />
          <Text style={[styles.tabText, activeTab === 'stats' && styles.activeTabText]}>Analytics</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'share' && (
        <ThemedCard style={styles.tabContent} padding={20}>
          {/* Referral Code */}
          <View style={styles.codeContainer}>
            <Text style={styles.sectionTitle}>Your Referral Code</Text>
            <View style={styles.codeDisplay}>
              <Text style={styles.code}>{referralData.referralCode}</Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => copyToClipboard(referralData.referralCode, 'Referral code')}
              >
                <Ionicons name="copy-outline" size={20} color="#667eea" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mobile App Sharing */}
          <View style={styles.sharingContainer}>
            <Text style={styles.sectionTitle}>One-Tap Mobile Sharing</Text>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareViaApp('whatsapp')}
            >
              <View style={styles.shareButtonContent}>
                <Text style={styles.shareIcon}>💬</Text>
                <Text style={styles.shareButtonText}>Share on WhatsApp</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#7F8C8D" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareViaApp('telegram')}
            >
              <View style={styles.shareButtonContent}>
                <Text style={styles.shareIcon}>✈️</Text>
                <Text style={styles.shareButtonText}>Share on Telegram</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#7F8C8D" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareViaApp('sms')}
            >
              <View style={styles.shareButtonContent}>
                <Text style={styles.shareIcon}>📱</Text>
                <Text style={styles.shareButtonText}>Share via SMS</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#7F8C8D" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareButton, styles.genericShareButton]}
              onPress={shareGeneric}
            >
              <View style={styles.shareButtonContent}>
                <Ionicons name="share-outline" size={24} color="#FFF" />
                <Text style={[styles.shareButtonText, { color: '#FFF' }]}>Share Anywhere</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>
        </ThemedCard>
      )}

      {activeTab === 'qr' && (
        <ThemedCard style={styles.tabContent} padding={20}>
          <Text style={styles.sectionTitle}>Your Share QR Code</Text>
          <Text style={styles.sectionSubtitle}>One QR code for everything - referrals and payments!</Text>

          <View style={styles.qrContainer}>
            {/* SIMPLIFIED: Show only the first QR code (wallet-based) */}
            {referralData.qrCodes.length > 0 && (
              <View style={styles.qrCardSingle}>
                <Text style={styles.qrTitle}>
                  Wallet Share Link
                </Text>
                <Text style={styles.qrDescription}>
                  Use this for referrals AND receiving payments
                </Text>

                <View style={styles.qrImageContainerLarge}>
                  {qrImages[referralData.qrCodes[0].type] ? (
                    <Image
                      source={{ uri: qrImages[referralData.qrCodes[0].type] }}
                      style={styles.qrImageLarge}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.qrPlaceholderLarge}>
                      <Text style={styles.qrPlaceholderText}>Loading QR...</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.qrCopyButton}
                  onPress={() => copyToClipboard(referralData.qrCodes[0].data, 'Share link')}
                >
                  <Ionicons name="copy-outline" size={16} color="#667eea" />
                  <Text style={styles.qrCopyText}>Copy Link</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.qrInfo}>
            <Ionicons name="information-circle-outline" size={20} color="#667eea" />
            <Text style={styles.qrInfoText}>
              This single QR code works for both referral bonuses and receiving A50 payments!
            </Text>
          </View>
        </ThemedCard>
      )}

      {activeTab === 'stats' && (
        <ThemedCard style={styles.tabContent} padding={20}>
          <Text style={styles.sectionTitle}>Referral Analytics</Text>

          <View style={styles.analyticsContainer}>
            <View style={styles.analyticsCard}>
              <Ionicons name="people-outline" size={32} color="#3498DB" />
              <Text style={styles.analyticsValue}>{referralData.totalReferrals}</Text>
              <Text style={styles.analyticsLabel}>Total Referrals</Text>
            </View>

            <View style={styles.analyticsCard}>
              <Ionicons name="diamond-outline" size={32} color="#27AE60" />
              <Text style={styles.analyticsValue}>{parseFloat(referralData.totalEarnings).toFixed(2)}</Text>
              <Text style={styles.analyticsLabel}>A50 Earned</Text>
            </View>

            <View style={styles.analyticsCard}>
              <Ionicons name="trending-up-outline" size={32} color="#E67E22" />
              <Text style={styles.analyticsValue}>{referralData.trustMultiplier.toFixed(1)}x</Text>
              <Text style={styles.analyticsLabel}>Trust Multiplier</Text>
            </View>

            <View style={styles.analyticsCard}>
              <Ionicons name="shield-outline" size={32} color="#9B59B6" />
              <Text style={styles.analyticsValue}>{trustInfo.level}</Text>
              <Text style={styles.analyticsLabel}>Trust Level</Text>
            </View>
          </View>

          {/* Trust Progression */}
          <View style={styles.progressContainer}>
            <Text style={styles.progressTitle}>Trust Level Progression</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (referralData.trustMultiplier / 3.0) * 100)}%`,
                    backgroundColor: trustInfo.color
                  }
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              Next level: {referralData.trustMultiplier >= 3.0 ? 'Maximum reached!' : 'Keep participating to increase trust'}
            </Text>
          </View>
        </ThemedCard>
      )}

      {/* Benefits Info */}
      <ThemedCard style={styles.benefitsContainer} padding={20}>
        <Text style={styles.benefitsTitle}>🚀 Mobile-Native Benefits</Text>
        <View style={styles.benefitsList}>
          <Text style={styles.benefitItem}>📱 Works on any smartphone</Text>
          <Text style={styles.benefitItem}>🌍 2G network compatible</Text>
          <Text style={styles.benefitItem}>🏆 Trust increases over time</Text>
          <Text style={styles.benefitItem}>💰 Up to 3x referral bonuses</Text>
          <Text style={styles.benefitItem}>🔗 Multiple sharing options</Text>
        </View>
      </ThemedCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#7F8C8D',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#E74C3C',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#3498DB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFF',
    fontSize: 16,
  },
  header: {
    padding: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
  trustContainer: {
    alignItems: 'center',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
  },
  trustEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  trustText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  trustMultiplier: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginTop: -12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statCard: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  statLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#F0F2FF',
  },
  tabText: {
    fontSize: 14,
    color: '#7F8C8D',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#667eea',
    fontWeight: 'bold',
  },
  tabContent: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 16,
  },
  codeContainer: {
    marginBottom: 24,
  },
  codeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 16,
  },
  code: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'monospace',
    color: '#2C3E50',
  },
  copyButton: {
    padding: 8,
  },
  sharingContainer: {
    marginBottom: 16,
  },
  shareButton: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  genericShareButton: {
    backgroundColor: '#667eea',
  },
  shareButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shareIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  shareButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#2C3E50',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qrCardSingle: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    width: '100%',
  },
  qrCard: {
    width: (width - 64) / 2,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
    textAlign: 'center',
  },
  qrDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 16,
    textAlign: 'center',
  },
  qrImageContainer: {
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  qrImageContainerLarge: {
    width: 200,
    height: 200,
    marginBottom: 16,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
  },
  qrImage: {
    width: 120,
    height: 120,
  },
  qrImageLarge: {
    width: 200,
    height: 200,
  },
  qrPlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#ECF0F1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderLarge: {
    width: 200,
    height: 200,
    backgroundColor: '#ECF0F1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  qrInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EBF4FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  qrInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    marginLeft: 8,
    lineHeight: 18,
  },
  qrCopyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFF',
    borderRadius: 6,
  },
  qrCopyText: {
    fontSize: 12,
    color: '#667eea',
    marginLeft: 4,
  },
  analyticsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  analyticsCard: {
    width: (width - 64) / 2,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  analyticsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginTop: 8,
  },
  analyticsLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    marginTop: 4,
    textAlign: 'center',
  },
  progressContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#ECF0F1',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#7F8C8D',
    textAlign: 'center',
  },
  benefitsContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 32,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
    textAlign: 'center',
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    fontSize: 14,
    color: '#7F8C8D',
    paddingVertical: 4,
  },
});

export default MobileReferralScreen;