import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

import SybilInsurancePool, {
  type InsurancePoolStats,
  type RewardEligibility,
  type PoolContribution,
  type HonestUserReward,
  type FundingProposal,
} from '../services/SybilInsurancePool';
import { EnhancedWalletService } from '../services/EnhancedWalletService';

interface InsurancePoolScreenProps {
  navigation: any;
}

type TabKey = 'overview' | 'activity' | 'governance';

export function InsurancePoolScreen({ navigation }: InsurancePoolScreenProps) {
  const { colors, isDark } = useTheme();
  const [poolStats, setPoolStats] = useState<InsurancePoolStats | null>(null);
  const [userEligibility, setUserEligibility] = useState<RewardEligibility | null>(null);
  const [contributions, setContributions] = useState<PoolContribution[]>([]);
  const [myRewards, setMyRewards] = useState<HonestUserReward[]>([]);
  const [proposals, setProposals] = useState<FundingProposal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('');
  const [donationMessage, setDonationMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDonating, setIsDonating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const insurancePool = SybilInsurancePool.getInstance();
  const walletService = EnhancedWalletService.getInstance();

  useEffect(() => {
    loadPoolData();
  }, []);

  const loadPoolData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch all data in parallel
      const [stats, eligibility, contribResult, rewardResult, proposalList] = await Promise.all([
        insurancePool.getPoolStats(),
        (async () => {
          const user = walletService.getUser();
          if (user) return insurancePool.calculateRewardEligibility(user.id);
          return null;
        })(),
        insurancePool.getContributions(10),
        insurancePool.getRewards(true, 10),
        insurancePool.getProposals(),
      ]);

      setPoolStats(stats);
      setUserEligibility(eligibility);
      setContributions(contribResult.contributions);
      setMyRewards(rewardResult.rewards);
      setProposals(proposalList);
    } catch (error) {
      console.error('Failed to load pool data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    insurancePool.clearCache();
    await loadPoolData();
    setRefreshing(false);
  };

  const handleVoluntaryDonation = async () => {
    try {
      if (!donationAmount || parseFloat(donationAmount) <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid donation amount.');
        return;
      }

      const user = walletService.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated.');
        return;
      }

      const userBalance = parseFloat(walletService.getBalance());
      const donationValue = parseFloat(donationAmount);

      if (userBalance < donationValue) {
        Alert.alert(
          'Insufficient Balance',
          `You need ${donationAmount} A50 (current: ${userBalance.toFixed(4)} A50)`
        );
        return;
      }

      Alert.alert(
        'Confirm Donation',
        `Donate ${donationAmount} A50 to the Sybil Insurance Pool?\n\nThis protects honest users and funds ecosystem growth.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Donate',
            onPress: async () => {
              try {
                setIsDonating(true);
                const result = await insurancePool.makeVoluntaryContribution(
                  user.id,
                  donationAmount,
                  donationMessage || 'Supporting honest users and ecosystem growth'
                );

                // Update local balance if returned
                if (result.newBalance) {
                  walletService.syncBalanceFromBackend?.();
                }

                Alert.alert(
                  'Thank You!',
                  `Your ${donationAmount} A50 donation has been added to the Insurance Pool.`
                );

                setShowDonationModal(false);
                setDonationAmount('');
                setDonationMessage('');
                await onRefresh();
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Donation failed');
              } finally {
                setIsDonating(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to process donation.');
    }
  };

  const getEligibilityColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return '#6B7280';
  };

  const getEligibilityLabel = (score: number) => {
    if (score >= 80) return 'High Eligibility';
    if (score >= 60) return 'Medium Eligibility';
    if (score >= 40) return 'Low Eligibility';
    return 'Not Yet Eligible';
  };

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getSourceIcon = (source: string): string => {
    switch (source) {
      case 'Sybil Slashing': return 'flash';
      case 'Donation': return 'heart';
      case 'Protocol Fee': return 'swap-horizontal';
      case 'Reward': return 'gift';
      default: return 'ellipse';
    }
  };

  const getSourceColor = (source: string): string => {
    switch (source) {
      case 'Sybil Slashing': return '#EF4444';
      case 'Donation': return '#EC4899';
      case 'Protocol Fee': return '#6366F1';
      case 'Reward': return '#10B981';
      default: return '#6B7280';
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading Insurance Pool...</Text>
        </View>
      </View>
    );
  }

  const renderOverviewTab = () => (
    <>
      {/* Pool Statistics */}
      {poolStats && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pool Statistics</Text>
          <View style={styles.statsGrid}>
            {[
              { icon: 'wallet-outline', color: colors.accent, value: parseFloat(poolStats.totalBalance).toLocaleString(undefined, { maximumFractionDigits: 2 }), label: 'Pool Balance (A50)' },
              { icon: 'flash-outline', color: '#EF4444', value: String(poolStats.sybilAttacksStopped), label: 'Attacks Stopped' },
              { icon: 'people-outline', color: '#10B981', value: String(poolStats.honestUsersRewarded), label: 'Users Rewarded' },
              { icon: 'gift-outline', color: '#F59E0B', value: parseFloat(poolStats.totalRewardsDistributed).toLocaleString(undefined, { maximumFractionDigits: 1 }), label: 'Rewards Paid (A50)' },
            ].map(({ icon, color: ic, value, label }) => (
              <ThemedCard key={label} style={styles.statCard} padding={14}>
                <Ionicons name={icon as any} size={20} color={ic} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
              </ThemedCard>
            ))}
          </View>
        </View>
      )}

      {/* Your Eligibility */}
      {userEligibility && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Reward Eligibility</Text>
          <ThemedCard style={styles.eligibilityCard} padding={18}>
            <View style={styles.eligibilityHeader}>
              <View style={styles.scoreCircle}>
                <Text style={[styles.scoreValue, { color: getEligibilityColor(userEligibility.eligibilityScore) }]}>
                  {userEligibility.eligibilityScore}
                </Text>
                <Text style={[styles.scoreMax, { color: colors.textMuted }]}>/100</Text>
              </View>
              <View style={styles.eligibilityInfo}>
                <Text style={[styles.eligibilityLabel, { color: getEligibilityColor(userEligibility.eligibilityScore) }]}>
                  {getEligibilityLabel(userEligibility.eligibilityScore)}
                </Text>
                <Text style={[styles.estimatedReward, { color: colors.textMuted }]}>
                  Est. reward: {userEligibility.estimatedReward} A50
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            <View style={styles.criteriaList}>
              <View style={styles.criteriaItem}>
                <Ionicons
                  name={userEligibility.eligibilityCriteria.completedSecurityCircle ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={userEligibility.eligibilityCriteria.completedSecurityCircle ? '#10B981' : '#EF4444'}
                />
                <Text style={[styles.criteriaText, { color: colors.textSecondary }]}>Security Circle Complete</Text>
                <Text style={[styles.criteriaPoints, { color: colors.textMuted }]}>
                  {userEligibility.eligibilityCriteria.completedSecurityCircle ? '+40' : '0'} pts
                </Text>
              </View>
              <View style={styles.criteriaItem}>
                <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
                <Text style={[styles.criteriaText, { color: colors.textSecondary }]}>
                  Trust: {userEligibility.eligibilityCriteria.trustLevel}
                </Text>
                <Text style={[styles.criteriaPoints, { color: colors.textMuted }]}>
                  {userEligibility.eligibilityCriteria.trustLevel === 'elite' ? '+30' :
                   userEligibility.eligibilityCriteria.trustLevel === 'premium' ? '+25' :
                   userEligibility.eligibilityCriteria.trustLevel === 'verified' ? '+20' :
                   userEligibility.eligibilityCriteria.trustLevel === 'established' ? '+10' : '+2'} pts
                </Text>
              </View>
              <View style={styles.criteriaItem}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <Text style={[styles.criteriaText, { color: colors.textSecondary }]}>
                  {userEligibility.eligibilityCriteria.participationDays} days active
                </Text>
                <Text style={[styles.criteriaPoints, { color: colors.textMuted }]}>
                  +{Math.min(Math.floor(userEligibility.eligibilityCriteria.participationDays / 5), 20)} pts
                </Text>
              </View>
              <View style={styles.criteriaItem}>
                <Ionicons name="people" size={18} color={colors.accent} />
                <Text style={[styles.criteriaText, { color: colors.textSecondary }]}>
                  {userEligibility.eligibilityCriteria.communityVouches} active referrals
                </Text>
                <Text style={[styles.criteriaPoints, { color: colors.textMuted }]}>
                  +{Math.min(userEligibility.eligibilityCriteria.communityVouches * 2, 10)} pts
                </Text>
              </View>
              {!userEligibility.eligibilityCriteria.slashingRisk && (
                <View style={styles.criteriaItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.criteriaText, { color: '#10B981' }]}>No slashing risk</Text>
                </View>
              )}
            </View>
          </ThemedCard>
        </View>
      )}

      {/* Reward Distribution Breakdown */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>How Rewards Are Distributed</Text>
        <ThemedCard style={styles.distributionCard}>
          {[
            { color: '#10B981', label: 'Honest Users', width: '60%' as any, pct: '60%' },
            { color: '#3B82F6', label: 'Sybil Detectors', width: '25%' as any, pct: '25%' },
            { color: '#8B5CF6', label: 'Ecosystem Fund', width: '10%' as any, pct: '10%' },
            { color: '#6B7280', label: 'Reserves', width: '5%' as any, pct: '5%' },
          ].map(({ color: dc, label, width, pct }) => (
            <View key={label} style={styles.distributionRow}>
              <View style={[styles.distributionDot, { backgroundColor: dc }]} />
              <Text style={[styles.distributionLabel, { color: colors.textSecondary }]}>{label}</Text>
              <View style={[styles.distributionBarContainer, { backgroundColor: colors.card2 }]}>
                <View style={[styles.distributionBar, { width, backgroundColor: dc }]} />
              </View>
              <Text style={[styles.distributionPercent, { color: colors.textSecondary }]}>{pct}</Text>
            </View>
          ))}
        </ThemedCard>
      </View>

      {/* Funding Sources */}
      {poolStats && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pool Funding Sources</Text>
          <ThemedCard style={styles.fundingCard} padding={4}>
            {[
              { iconBg: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2', icon: 'flash', iconColor: '#EF4444', label: 'Sybil Slashing', amount: parseFloat(poolStats.contributionsBySource.sybil_slashing).toFixed(2) },
              { iconBg: isDark ? 'rgba(236,72,153,0.15)' : '#FCE7F3', icon: 'heart', iconColor: '#EC4899', label: 'Voluntary Donations', amount: parseFloat(poolStats.contributionsBySource.voluntary_donation).toFixed(2) },
              { iconBg: isDark ? 'rgba(99,102,241,0.15)' : '#EDE9FE', icon: 'swap-horizontal', iconColor: '#6366F1', label: 'Protocol Fees', amount: parseFloat(poolStats.contributionsBySource.protocol_fee).toFixed(2) },
            ].map(({ iconBg, icon, iconColor, label, amount }) => (
              <View key={label} style={[styles.fundingItem, { borderBottomColor: colors.cardBorder }]}>
                <View style={styles.fundingLeft}>
                  <View style={[styles.fundingIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={icon as any} size={16} color={iconColor} />
                  </View>
                  <Text style={[styles.fundingLabel, { color: colors.textSecondary }]}>{label}</Text>
                </View>
                <Text style={[styles.fundingAmount, { color: colors.textPrimary }]}>{amount} A50</Text>
              </View>
            ))}
          </ThemedCard>
        </View>
      )}

      {/* Voluntary Donation Card */}
      <View style={styles.section}>
        <View style={styles.voluntaryCard}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.voluntaryCardGradient}
          >
            {/* Decorative circles */}
            <View style={styles.donationCircle1} />
            <View style={styles.donationCircle2} />

            <View style={styles.voluntaryCardInner}>
              <View style={styles.voluntaryCardHeader}>
                <View style={styles.voluntaryIconBadge}>
                  <Ionicons name="heart" size={22} color="#059669" />
                </View>
                <Text style={styles.voluntaryCardTitle}>Voluntary Donations</Text>
              </View>

              <Text style={styles.voluntaryCardBody}>
                Help reward honest participants and fund ecosystem growth. 100% of voluntary donations
                flow back to verified community members.
              </Text>

              <View style={styles.voluntaryCardStats}>
                <View style={styles.voluntaryStatItem}>
                  <Text style={styles.voluntaryStatValue}>100%</Text>
                  <Text style={styles.voluntaryStatLabel}>To Community</Text>
                </View>
                <View style={styles.voluntaryStatDivider} />
                <View style={styles.voluntaryStatItem}>
                  <Text style={styles.voluntaryStatValue}>0%</Text>
                  <Text style={styles.voluntaryStatLabel}>Platform Fee</Text>
                </View>
                <View style={styles.voluntaryStatDivider} />
                <View style={styles.voluntaryStatItem}>
                  <Text style={styles.voluntaryStatValue}>A50</Text>
                  <Text style={styles.voluntaryStatLabel}>Currency</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.voluntaryDonateBtn}
                onPress={() => setShowDonationModal(true)}
              >
                <Ionicons name="heart-outline" size={16} color="#059669" />
                <Text style={styles.voluntaryDonateBtnText}>Make a Donation</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </>
  );

  const renderActivityTab = () => (
    <>
      {/* Recent Activity Feed */}
      {poolStats && poolStats.recentActivity.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Activity</Text>
          <ThemedCard style={styles.activityCard} padding={0}>
            {poolStats.recentActivity.map((activity, index) => (
              <View
                key={`activity-${index}`}
                style={[styles.activityItem, index < poolStats.recentActivity.length - 1 && [styles.activityBorder, { borderBottomColor: colors.cardBorder }]]}
              >
                <View style={[styles.activityIcon, { backgroundColor: getSourceColor(activity.type) + '20' }]}>
                  <Ionicons
                    name={getSourceIcon(activity.type) as any}
                    size={16}
                    color={getSourceColor(activity.type)}
                  />
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityTop}>
                    <Text style={[styles.activityType, { color: colors.textPrimary }]}>{activity.type}</Text>
                    <Text style={[styles.activityAmount, { color: activity.type === 'Reward' ? '#10B981' : colors.accent }]}>
                      {activity.type === 'Reward' ? '+' : ''}{parseFloat(activity.amount).toFixed(4)} A50
                    </Text>
                  </View>
                  <Text style={[styles.activityDesc, { color: colors.textMuted }]} numberOfLines={1}>
                    {activity.description}
                  </Text>
                  <Text style={[styles.activityTime, { color: colors.textMuted }]}>{formatTimeAgo(activity.timestamp)}</Text>
                </View>
              </View>
            ))}
          </ThemedCard>
        </View>
      )}

      {/* My Rewards */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Rewards</Text>
        {myRewards.length > 0 ? (
          <ThemedCard style={styles.activityCard} padding={0}>
            {myRewards.map((reward, index) => (
              <View
                key={reward.id}
                style={[styles.activityItem, index < myRewards.length - 1 && [styles.activityBorder, { borderBottomColor: colors.cardBorder }]]}
              >
                <View style={[styles.activityIcon, { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5' }]}>
                  <Ionicons name="gift" size={16} color="#10B981" />
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityTop}>
                    <Text style={[styles.activityType, { color: colors.textPrimary }]}>
                      {reward.rewardType === 'circle_completion' ? 'Circle Reward' :
                       reward.rewardType === 'detection_bonus' ? 'Detection Bonus' :
                       reward.rewardType === 'loyalty_bonus' ? 'Loyalty Bonus' : 'Reward'}
                    </Text>
                    <Text style={[styles.activityAmount, { color: '#10B981' }]}>
                      +{parseFloat(reward.amount).toFixed(4)} A50
                    </Text>
                  </View>
                  <Text style={[styles.activityDesc, { color: colors.textMuted }]} numberOfLines={1}>
                    {reward.eligibilityCriteria.join(' | ')}
                  </Text>
                  <Text style={[styles.activityTime, { color: colors.textMuted }]}>{formatTimeAgo(reward.distributedAt)}</Text>
                </View>
              </View>
            ))}
          </ThemedCard>
        ) : (
          <ThemedCard style={styles.emptyState} padding={32}>
            <Ionicons name="gift-outline" size={40} color={colors.emptyIcon} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Rewards Yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              Increase your eligibility score to earn rewards when Sybil attacks are detected.
            </Text>
          </ThemedCard>
        )}
      </View>

      {/* Contribution History */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Contributions</Text>
        {contributions.length > 0 ? (
          <ThemedCard style={styles.activityCard} padding={0}>
            {contributions.map((contrib, index) => (
              <View
                key={contrib.id}
                style={[styles.activityItem, index < contributions.length - 1 && [styles.activityBorder, { borderBottomColor: colors.cardBorder }]]}
              >
                <View style={[styles.activityIcon, { backgroundColor: contrib.source === 'sybil_slashing' ? (isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2') : (isDark ? 'rgba(236,72,153,0.2)' : '#FCE7F3') }]}>
                  <Ionicons
                    name={contrib.source === 'sybil_slashing' ? 'flash' : contrib.source === 'voluntary_donation' ? 'heart' : 'swap-horizontal'}
                    size={16}
                    color={contrib.source === 'sybil_slashing' ? '#EF4444' : '#EC4899'}
                  />
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityTop}>
                    <Text style={[styles.activityType, { color: colors.textPrimary }]}>
                      {contrib.source === 'sybil_slashing' ? 'Slashing' :
                       contrib.source === 'voluntary_donation' ? 'Donation' : 'Protocol Fee'}
                    </Text>
                    <Text style={[styles.activityAmount, { color: colors.accent }]}>
                      {parseFloat(contrib.amount).toFixed(4)} A50
                    </Text>
                  </View>
                  <Text style={[styles.activityDesc, { color: colors.textMuted }]} numberOfLines={1}>{contrib.reason}</Text>
                  <Text style={[styles.activityTime, { color: colors.textMuted }]}>{formatTimeAgo(contrib.timestamp)}</Text>
                </View>
              </View>
            ))}
          </ThemedCard>
        ) : (
          <ThemedCard style={styles.emptyState} padding={32}>
            <Ionicons name="layers-outline" size={40} color={colors.emptyIcon} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Contributions Yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              Pool contributions will appear here as the network grows.
            </Text>
          </ThemedCard>
        )}
      </View>
    </>
  );

  const renderGovernanceTab = () => (
    <>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ecosystem Proposals</Text>
        {proposals.length > 0 ? (
          proposals.map((proposal) => (
            <ThemedCard key={proposal.id} style={styles.proposalCard}>
              <View style={styles.proposalHeader}>
                <Text style={[styles.proposalName, { color: colors.textPrimary }]}>{proposal.projectName}</Text>
                <View style={[
                  styles.proposalStatus,
                  { backgroundColor: proposal.status === 'active' ? (isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5') : proposal.status === 'passed' ? (isDark ? 'rgba(59,130,246,0.2)' : '#DBEAFE') : (isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2') }
                ]}>
                  <Text style={[
                    styles.proposalStatusText,
                    { color: proposal.status === 'active' ? '#059669' : proposal.status === 'passed' ? '#2563EB' : '#DC2626' }
                  ]}>
                    {proposal.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={[styles.proposalDesc, { color: colors.textMuted }]}>{proposal.description}</Text>
              <View style={styles.proposalMeta}>
                <Text style={[styles.proposalAmount, { color: colors.accent }]}>{proposal.amount} A50</Text>
                <Text style={[styles.proposalPurpose, { color: colors.textMuted }]}>{proposal.purpose}</Text>
              </View>
              <View style={styles.proposalVotes}>
                <View style={[styles.voteBar, { backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2' }]}>
                  <View
                    style={[
                      styles.voteBarFill,
                      {
                        width: `${proposal.votes.yes + proposal.votes.no > 0
                          ? (proposal.votes.yes / (proposal.votes.yes + proposal.votes.no)) * 100
                          : 0}%`,
                        backgroundColor: '#10B981',
                      },
                    ]}
                  />
                </View>
                <View style={styles.voteLabels}>
                  <Text style={[styles.voteLabel, { color: colors.textMuted }]}>Yes: {proposal.votes.yes}</Text>
                  <Text style={[styles.voteLabel, { color: colors.textMuted }]}>No: {proposal.votes.no}</Text>
                </View>
              </View>
              {proposal.status === 'active' && (
                <View style={styles.voteActions}>
                  <TouchableOpacity
                    style={[styles.voteButton, styles.voteYes]}
                    onPress={async () => {
                      try {
                        await insurancePool.voteOnProposal(proposal.id, 'yes');
                        await onRefresh();
                      } catch (e: any) {
                        Alert.alert('Vote Error', e.message);
                      }
                    }}
                  >
                    <Ionicons name="thumbs-up" size={14} color="white" />
                    <Text style={styles.voteButtonText}>Vote Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voteButton, styles.voteNo]}
                    onPress={async () => {
                      try {
                        await insurancePool.voteOnProposal(proposal.id, 'no');
                        await onRefresh();
                      } catch (e: any) {
                        Alert.alert('Vote Error', e.message);
                      }
                    }}
                  >
                    <Ionicons name="thumbs-down" size={14} color="white" />
                    <Text style={styles.voteButtonText}>Vote No</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={[styles.proposalEnds, { color: colors.textMuted }]}>
                {proposal.status === 'active'
                  ? `Voting ends ${formatTimeAgo(proposal.votingEnds)}`
                  : `Ended ${formatTimeAgo(proposal.votingEnds)}`}
              </Text>
            </ThemedCard>
          ))
        ) : (
          <ThemedCard style={styles.emptyState} padding={32}>
            <Ionicons name="document-text-outline" size={40} color={colors.emptyIcon} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Proposals Yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              Community members can propose ecosystem funding from the pool's development fund.
            </Text>
          </ThemedCard>
        )}
      </View>

      {/* How It Works */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>How Sybil Insurance Works</Text>
        <ThemedCard style={styles.howItWorksCard} padding={18}>
          <View style={styles.stepItem}>
            <View style={[styles.stepIcon, { backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2' }]}>
              <Ionicons name="warning" size={18} color="#EF4444" />
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>1. Sybil Attack Detected</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>Fake accounts are identified and their stakes confiscated</Text>
            </View>
          </View>
          <View style={[styles.stepConnector, { backgroundColor: colors.cardBorder }]} />
          <View style={styles.stepItem}>
            <View style={[styles.stepIcon, { backgroundColor: isDark ? 'rgba(102,126,234,0.2)' : '#EDE9FE' }]}>
              <Ionicons name="arrow-down" size={18} color="#667eea" />
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>2. Funds Added to Pool</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>Slashed A50 automatically goes to the Insurance Pool</Text>
            </View>
          </View>
          <View style={[styles.stepConnector, { backgroundColor: colors.cardBorder }]} />
          <View style={styles.stepItem}>
            <View style={[styles.stepIcon, { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5' }]}>
              <Ionicons name="gift" size={18} color="#10B981" />
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>3. Honest Users Rewarded</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>60% distributed proportionally to eligible honest users</Text>
            </View>
          </View>
          <View style={[styles.stepConnector, { backgroundColor: colors.cardBorder }]} />
          <View style={styles.stepItem}>
            <View style={[styles.stepIcon, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#DBEAFE' }]}>
              <Ionicons name="leaf" size={18} color="#3B82F6" />
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>4. Ecosystem Grows</Text>
              <Text style={[styles.stepDesc, { color: colors.textMuted }]}>25% to detection contributors, 10% to ecosystem, 5% reserves</Text>
            </View>
          </View>
        </ThemedCard>
      </View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header */}
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.header}>
          <View style={styles.headerContent}>
            <Ionicons name="shield-checkmark" size={36} color="white" />
            <Text style={styles.headerTitle}>Sybil Insurance Pool</Text>
            <Text style={styles.headerSubtitle}>Protecting honest users, funding growth</Text>
            {poolStats && (
              <View style={styles.headerBalance}>
                <Text style={styles.headerBalanceValue}>
                  {parseFloat(poolStats.totalBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} A50
                </Text>
                <Text style={styles.headerBalanceLabel}>Total Pool Balance</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Tab Switcher */}
        <View style={[styles.tabContainer, { backgroundColor: isDark ? colors.card2 : '#E5E7EB' }]}>
          {(['overview', 'activity', 'governance'] as TabKey[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && [styles.activeTab, { backgroundColor: isDark ? colors.card : 'white' }]]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === tab && { color: colors.accent }]}>
                {tab === 'overview' ? 'Overview' : tab === 'activity' ? 'Activity' : 'Governance'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'activity' && renderActivityTab()}
        {activeTab === 'governance' && renderGovernanceTab()}

        {/* Bottom Security Notice */}
        <View style={[styles.securityNotice, { backgroundColor: isDark ? colors.card2 : '#F3F4F6' }]}>
          <Ionicons name="shield-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.securityText, { color: colors.textMuted }]}>
            Attacks benefit honest users - creating positive-sum security for the AURA50 network
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Donation Modal */}
      <Modal
        visible={showDonationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDonationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Make a Donation</Text>
              <TouchableOpacity onPress={() => setShowDonationModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Help reward honest users and fund ecosystem growth
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Amount (A50)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: isDark ? colors.card2 : '#F9FAFB', borderColor: isDark ? colors.cardBorder : '#D1D5DB' }]}
                value={donationAmount}
                onChangeText={setDonationAmount}
                placeholder="Enter amount..."
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Message (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.textPrimary, backgroundColor: isDark ? colors.card2 : '#F9FAFB', borderColor: isDark ? colors.cardBorder : '#D1D5DB' }]}
                value={donationMessage}
                onChangeText={setDonationMessage}
                placeholder="Why are you donating?"
                placeholderTextColor={colors.placeholder}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: isDark ? colors.card2 : '#F3F4F6' }]}
                onPress={() => setShowDonationModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleVoluntaryDonation}
                disabled={isDonating}
              >
                {isDonating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.confirmButtonText}>Donate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },

  // Header
  header: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  headerBalance: {
    marginTop: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  headerBalanceValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  headerBalanceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#667eea',
  },

  // Section
  section: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    alignItems: 'center',
    width: (width - 42) / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },

  // Eligibility
  eligibilityCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  eligibilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreCircle: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  eligibilityInfo: {
    flex: 1,
  },
  eligibilityLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  estimatedReward: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 14,
  },
  criteriaList: {
    gap: 10,
  },
  criteriaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  criteriaText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  criteriaPoints: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },

  // Distribution
  distributionCard: {
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distributionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distributionLabel: {
    fontSize: 13,
    color: '#374151',
    width: 100,
  },
  distributionBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
  },
  distributionBar: {
    height: 8,
    borderRadius: 4,
  },
  distributionPercent: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    width: 36,
    textAlign: 'right',
  },

  // Funding Sources
  fundingCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  fundingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fundingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fundingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fundingLabel: {
    fontSize: 14,
    color: '#374151',
  },
  fundingAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667eea',
  },

  // Donate Button
  donateButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  donateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  donateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  voluntaryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  voluntaryCardGradient: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  donationCircle1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -30,
  },
  donationCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: 20,
  },
  voluntaryCardInner: {
    padding: 20,
  },
  voluntaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  voluntaryIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voluntaryCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  voluntaryCardBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
    marginBottom: 16,
  },
  voluntaryCardStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  voluntaryStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  voluntaryStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  voluntaryStatLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    textAlign: 'center',
  },
  voluntaryStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 4,
  },
  voluntaryDonateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  voluntaryDonateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },

  // Activity
  activityCard: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  activityItem: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  activityAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667eea',
  },
  activityDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Proposals
  proposalCard: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  proposalName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  proposalStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proposalStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  proposalDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 18,
  },
  proposalMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  proposalAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667eea',
  },
  proposalPurpose: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  proposalVotes: {
    marginTop: 12,
  },
  voteBar: {
    height: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 3,
    overflow: 'hidden',
  },
  voteBarFill: {
    height: 6,
    borderRadius: 3,
  },
  voteLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  voteLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  voteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  voteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  voteYes: {
    backgroundColor: '#10B981',
  },
  voteNo: {
    backgroundColor: '#EF4444',
  },
  voteButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  proposalEnds: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },

  // How It Works
  howItWorksCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  stepDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  stepConnector: {
    width: 2,
    height: 16,
    backgroundColor: '#E5E7EB',
    marginLeft: 17,
  },

  // Security Notice
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    gap: 8,
  },
  securityText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
    lineHeight: 16,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#10B981',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default InsurancePoolScreen;
