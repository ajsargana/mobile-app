import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Clipboard,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { User, TrustLevel } from '../types';
import { QRScannerModal } from './QRScannerModal';
import config from '../config/environment';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import ThemedCard from './ThemedCard';

interface WalletSetupScreenProps {
  navigation: any;
  onWalletCreated?: () => void;
}

export const WalletSetupScreen: React.FC<WalletSetupScreenProps> = ({ navigation, onWalletCreated }) => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@aura50_pending_referral_code').then(code => {
      if (code) setReferralCode(code);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 2 && mnemonic.length === 0) {
      generateWallet();
    }
  }, [step]);

  const generateWallet = async () => {
    try {
      setIsCreating(true);
      const walletService = EnhancedWalletService.getInstance();

      console.log('🔑 Generating new HD wallet...');
      const wallet = await walletService.createWallet();

      if (wallet && wallet.mnemonic) {
        setMnemonic(wallet.mnemonic.split(' '));
        console.log('✅ Wallet generated successfully');
      } else {
        throw new Error('Failed to generate wallet mnemonic');
      }
    } catch (error) {
      console.error('❌ Wallet generation error:', error);
      Alert.alert(
        'Error',
        'Failed to generate wallet. Please try again.',
        [{ text: 'Retry', onPress: () => generateWallet() }]
      );
    } finally {
      setIsCreating(false);
    }
  };

  const copySeedPhrase = () => {
    const phrase = mnemonic.join(' ');
    Clipboard.setString(phrase);
    setHasCopied(true);
    Alert.alert('Copied!', 'Seed phrase copied to clipboard. Please save it securely.');
  };

  const registerWithBackend = async (): Promise<boolean> => {
    try {
      setIsCreating(true);
      const walletService = EnhancedWalletService.getInstance();

      const currentAccount = walletService.getCurrentAccount();
      if (!currentAccount) {
        throw new Error('No wallet account found');
      }

      console.log('📡 Registering user with backend...');
      const environment = config;

      // Generate password that meets backend requirements (12+ chars, uppercase, lowercase, number)
      const basePassword = currentAccount.privateKey.substring(0, 30);
      const validPassword = `A1${basePassword}`; // Add uppercase and number prefix

      // Log referral code being sent (for debugging)
      console.log('📋 Registration payload - referralCode:', referralCode || '(none)');

      const response = await fetch(`${environment.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${currentAccount.address.substring(0, 10)}@aura50.local`,
          password: validPassword,
          firstName: 'Mobile',
          lastName: 'User',
          username: currentAccount.address.substring(0, 12),
          referralCode: referralCode || undefined, // Include referral code if provided
        }),
      });

      if (response.ok) {
        const data = await response.json();
        await AsyncStorage.setItem('@aura50_auth_token', data.token);
        await AsyncStorage.setItem('@aura50_user_id', data.user.id);
        // Persist credentials so MiningService can silently re-authenticate after token expiry
        await AsyncStorage.setItem('@aura50_auth_email', `${currentAccount.address.substring(0, 10)}@aura50.local`);
        await AsyncStorage.setItem('@aura50_auth_pass', validPassword);

        // Set user data
        walletService.setUser({
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          referralCode: data.user.referralCode || '',
          createdAt: new Date(data.user.createdAt),
          trustLevel: TrustLevel.NEW,
          miningEnabled: true,
          balance: data.user.coinBalance || '0',
        } as User);

        // Sync wallet address to backend (for transfers)
        try {
          await fetch(`${environment.baseUrl}/api/user/sync-wallet`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.token}`,
            },
            body: JSON.stringify({
              walletAddress: currentAccount.address,
            }),
          });
          console.log('✅ Wallet address synced to backend');
        } catch (syncErr) {
          console.warn('⚠️ Failed to sync wallet address:', syncErr);
          // Non-critical, continue anyway
        }

        console.log('✅ User registered and authenticated with backend');

        // Clear pending referral code after successful registration
        if (referralCode) {
          await AsyncStorage.removeItem('@aura50_pending_referral_code');
          console.log('📋 Cleared pending referral code after successful registration');
        }

        return true;
      } else {
        const error = await response.json();
        console.warn('⚠️ Backend registration failed:', error.message);

        // Create local-only user (no backend)
        const userId = currentAccount.address;
        await AsyncStorage.setItem('@aura50_user_id', userId);

        const localUser = {
          id: userId,
          username: currentAccount.address.substring(0, 12),
          email: `${currentAccount.address.substring(0, 10)}@aura50.local`,
          firstName: 'Mobile',
          lastName: 'User',
          createdAt: new Date(),
          trustLevel: TrustLevel.NEW,
          miningEnabled: true,
          balance: '0',
        } as User;

        walletService.setUser(localUser);
        console.log('✅ Local user initialized (offline mode)');
        return true;
      }
    } catch (error) {
      console.error('❌ Registration error:', error);
      Alert.alert(
        'Registration Failed',
        'Could not connect to backend. You can still use the app in offline mode.',
        [
          { text: 'Continue Offline', onPress: () => setStep(4) },
          { text: 'Retry', onPress: () => registerWithBackend() }
        ]
      );
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  const handleComplete = async () => {
    const success = await registerWithBackend();
    if (success) {
      setStep(4);
    }
  };

  const handleReferralQRScan = async (data: string) => {
    console.log('Referral QR scanned:', data);

    // Extract referral code from URL if needed (e.g., https://AURA5O.com/join/CODE)
    let extractedCode = data;
    if (data.includes('/join/')) {
      const parts = data.split('/join/');
      extractedCode = parts[parts.length - 1].split('?')[0]; // Get code, remove query params
    } else if (data.includes('ref=')) {
      const match = data.match(/ref=([^&]+)/);
      if (match) extractedCode = match[1];
    }

    setReferralCode(extractedCode);
    setShowScanner(false);

    // Also persist to AsyncStorage so it's available even if user navigates away
    // and goes through AuthScreen's auto-registration
    try {
      await AsyncStorage.setItem('@aura50_pending_referral_code', extractedCode);
      console.log('📋 Referral code persisted to AsyncStorage:', extractedCode);
    } catch (error) {
      console.warn('Failed to persist referral code:', error);
    }

    Alert.alert('Success', 'Referral code scanned successfully!');
  };

  // Handler for manual referral code entry - also persists to AsyncStorage
  const handleReferralCodeChange = async (text: string) => {
    setReferralCode(text);

    // Persist to AsyncStorage so it's available even if user navigates away
    if (text && text.length > 3) {
      try {
          await AsyncStorage.setItem('@aura50_pending_referral_code', text);
      } catch (error) {
        console.warn('Failed to persist referral code:', error);
      }
    }
  };

  const renderStep1 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="wallet" size={64} color="#667eea" />
      </View>

      <Text style={styles.stepTitle}>{t('auth.createWallet')}</Text>
      <Text style={styles.stepDescription}>
        You're about to create a new AURA50 wallet. This wallet will allow you to:
      </Text>

      <View style={styles.featureList}>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color="#27AE60" />
          <Text style={styles.featureText}>Participate in block consensus on your mobile device</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color="#27AE60" />
          <Text style={styles.featureText}>Send and receive A50 transactions</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color="#27AE60" />
          <Text style={styles.featureText}>Earn credits through referrals</Text>
        </View>
        <View style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={24} color="#27AE60" />
          <Text style={styles.featureText}>Build trust and reduce fees over time</Text>
        </View>
      </View>

      <View style={styles.warningBox}>
        <Ionicons name="warning" size={24} color="#E67E22" />
        <Text style={styles.warningText}>
          You will receive a 24-word recovery phrase. Write it down and keep it safe.
          This is the ONLY way to recover your wallet if you lose access.
        </Text>
      </View>

      {/* Referral Code Input (Optional) */}
      <View style={styles.referralSection}>
        <Text style={styles.referralLabel}>Have a referral code? (Optional)</Text>
        <View style={styles.referralInputRow}>
          <TextInput
            style={styles.referralInput}
            placeholder="Enter referral code or username"
            placeholderTextColor="#9ca3af"
            value={referralCode}
            onChangeText={handleReferralCodeChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.scanReferralButton}
            onPress={() => setShowScanner(true)}
          >
            <Text style={styles.scanReferralButtonText}>📷</Text>
          </TouchableOpacity>
        </View>
        {referralCode ? (
          <Text style={styles.referralHint}>
            ✓ You'll earn bonus A50 when you join!
          </Text>
        ) : (
          <Text style={styles.referralHint}>
            Scan a friend's QR code or enter their username to earn rewards
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setStep(2)}
      >
        <Text style={styles.primaryButtonText}>{t('common.continue')}</Text>
        <Ionicons name="arrow-forward" size={20} color="#FFF" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="key" size={64} color="#667eea" />
      </View>

      <Text style={styles.stepTitle}>Your Recovery Phrase</Text>
      <Text style={styles.stepDescription}>
        Write down these 24 words in order and store them securely. Never share them with anyone.
      </Text>

      {isCreating ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Generating secure wallet...</Text>
        </View>
      ) : (
        <>
          <View style={styles.mnemonicContainer}>
            {mnemonic.map((word, index) => (
              <View key={index} style={styles.mnemonicWord}>
                <Text style={styles.mnemonicIndex}>{index + 1}</Text>
                <Text style={styles.mnemonicText}>{word}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.copyButton}
            onPress={copySeedPhrase}
          >
            <Ionicons name={hasCopied ? "checkmark-circle" : "copy"} size={20} color="#667eea" />
            <Text style={styles.copyButtonText}>
              {hasCopied ? "Copied to Clipboard" : "Copy to Clipboard"}
            </Text>
          </TouchableOpacity>

          <View style={styles.warningBox}>
            <Ionicons name="shield-checkmark" size={24} color="#E67E22" />
            <Text style={styles.warningText}>
              IMPORTANT: AURA50 cannot recover your wallet if you lose this phrase.
              Store it offline in a secure location.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, !hasCopied && styles.disabledButton]}
            onPress={() => setStep(3)}
            disabled={!hasCopied}
          >
            <Text style={styles.primaryButtonText}>I've Saved My Recovery Phrase</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep(1)}
          >
            <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark-done-circle" size={64} color="#667eea" />
      </View>

      <Text style={styles.stepTitle}>{t('common.confirm')}</Text>
      <Text style={styles.stepDescription}>
        Before we continue, please confirm that you have securely stored your recovery phrase.
      </Text>

      <View style={styles.confirmationBox}>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setHasConfirmed(!hasConfirmed)}
        >
          <Ionicons
            name={hasConfirmed ? "checkbox" : "square-outline"}
            size={24}
            color={hasConfirmed ? "#667eea" : "#95A5A6"}
          />
          <Text style={styles.checkboxText}>
            I have written down my 24-word recovery phrase and stored it in a safe place.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={24} color="#3498DB" />
        <Text style={styles.infoText}>
          Your wallet will now be registered with the AURA50 network. This enables block participation,
          transactions, and all blockchain features.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, !hasConfirmed && styles.disabledButton]}
        onPress={handleComplete}
        disabled={!hasConfirmed || isCreating}
      >
        {isCreating ? (
          <>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.primaryButtonText}>  Registering...</Text>
          </>
        ) : (
          <>
            <Text style={styles.primaryButtonText}>Complete Setup</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setStep(2)}
        disabled={isCreating}
      >
        <Text style={styles.secondaryButtonText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep4 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="rocket" size={64} color="#27AE60" />
      </View>

      <Text style={styles.successTitle}>Wallet Created!</Text>
      <Text style={styles.stepDescription}>
        Your AURA50 wallet is ready. You can now start forging, sending, and receiving A50 coins.
      </Text>

      <View style={styles.successBox}>
        <View style={styles.successItem}>
          <Ionicons name="checkmark-circle" size={32} color="#27AE60" />
          <Text style={styles.successText}>Wallet Generated</Text>
        </View>
        <View style={styles.successItem}>
          <Ionicons name="checkmark-circle" size={32} color="#27AE60" />
          <Text style={styles.successText}>Recovery Phrase Saved</Text>
        </View>
        <View style={styles.successItem}>
          <Ionicons name="checkmark-circle" size={32} color="#27AE60" />
          <Text style={styles.successText}>Registered on Network</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => {
          if (onWalletCreated) {
            onWalletCreated();
          } else {
            navigation.navigate('Home');
          }
        }}
      >
        <Text style={styles.primaryButtonText}>Start Using AURA50</Text>
        <Ionicons name="arrow-forward" size={20} color="#FFF" />
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet Setup</Text>
        <Text style={styles.headerSubtitle}>Step {step} of 4</Text>
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[
              styles.progressStep,
              s <= step && styles.progressStepActive
            ]}
          />
        ))}
      </View>

      <ThemedCard style={styles.contentContainer} padding={0}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ThemedCard>

      {/* QR Scanner Modal for Referral Codes */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleReferralQRScan}
        title="Scan Referral QR Code"
        subtitle="Position the referral QR code within the frame"
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: 4,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 4,
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: '#FFF',
  },
  contentContainer: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  stepContainer: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#27AE60',
    textAlign: 'center',
    marginBottom: 12,
  },
  stepDescription: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  featureList: {
    marginVertical: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 12,
    flex: 1,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3CD',
    padding: 16,
    borderRadius: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#D1ECF1',
    padding: 16,
    borderRadius: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#BEE5EB',
  },
  infoText: {
    fontSize: 14,
    color: '#0C5460',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  mnemonicContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  mnemonicWord: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  mnemonicIndex: {
    fontSize: 12,
    color: '#95A5A6',
    marginRight: 8,
    fontWeight: 'bold',
  },
  mnemonicText: {
    fontSize: 16,
    color: '#2C3E50',
    fontWeight: '600',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#667eea',
    marginVertical: 16,
  },
  copyButtonText: {
    fontSize: 16,
    color: '#667eea',
    fontWeight: '600',
    marginLeft: 8,
  },
  confirmationBox: {
    marginVertical: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  checkboxText: {
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 12,
    flex: 1,
    lineHeight: 24,
  },
  successBox: {
    marginVertical: 24,
  },
  successItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    justifyContent: 'center',
  },
  successText: {
    fontSize: 18,
    color: '#2C3E50',
    marginLeft: 12,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#667eea',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginRight: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#7F8C8D',
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#BDC3C7',
    elevation: 0,
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 48,
  },
  loadingText: {
    fontSize: 16,
    color: '#7F8C8D',
    marginTop: 16,
  },
  referralSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  referralLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  referralInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  referralInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  scanReferralButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanReferralButtonText: {
    fontSize: 20,
  },
  referralHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
