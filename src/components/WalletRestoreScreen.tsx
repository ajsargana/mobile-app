import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { User, TrustLevel } from '../types';
import config from '../config/environment';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

interface WalletRestoreScreenProps {
  navigation: any;
  onWalletRestored?: () => void;
}

export const WalletRestoreScreen: React.FC<WalletRestoreScreenProps> = ({ navigation, onWalletRestored }) => {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(24).fill(''));
  const [isRestoring, setIsRestoring] = useState(false);
  const [useTextInput, setUseTextInput] = useState(true);

  const updateWord = (index: number, word: string) => {
    const newWords = [...mnemonicWords];
    newWords[index] = word.trim().toLowerCase();
    setMnemonicWords(newWords);
  };

  const validateMnemonic = (words: string[]): boolean => {
    // Check if all words are filled
    if (words.some(w => w.length === 0)) {
      return false;
    }

    // Check if we have exactly 24 words
    if (words.length !== 24) {
      return false;
    }

    // Basic validation (real validation happens in wallet service)
    return true;
  };

  const handleRestore = async () => {
    try {
      setIsRestoring(true);

      // Prepare mnemonic
      let mnemonic: string;
      if (useTextInput) {
        mnemonic = mnemonicInput.trim().toLowerCase();
      } else {
        mnemonic = mnemonicWords.join(' ');
      }

      const words = mnemonic.split(' ').filter(w => w.length > 0);

      if (!validateMnemonic(words)) {
        Alert.alert(
          'Invalid Recovery Phrase',
          'Please enter a valid 24-word recovery phrase. Make sure all words are spelled correctly.'
        );
        return;
      }

      console.log('🔓 Restoring wallet from recovery phrase...');
      const walletService = EnhancedWalletService.getInstance();

      // Restore wallet from mnemonic
      const wallet = await walletService.restoreWallet(mnemonic);

      if (!wallet) {
        throw new Error('Failed to restore wallet from recovery phrase');
      }

      console.log('✅ Wallet restored successfully');
      setStep(2);

    } catch (error) {
      console.error('❌ Wallet restoration error:', error);
      Alert.alert(
        'Restoration Failed',
        'Unable to restore wallet. Please check your recovery phrase and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const registerWithBackend = async (): Promise<boolean> => {
    try {
      setIsRestoring(true);
      const walletService = EnhancedWalletService.getInstance();

      const currentAccount = walletService.getCurrentAccount();
      if (!currentAccount) {
        throw new Error('No wallet account found');
      }

      const environment = config;

      // Generate deterministic credentials from wallet address
      const email = `${currentAccount.address.substring(0, 10)}@aura50.local`;
      const basePassword = currentAccount.privateKey.substring(0, 30);
      const validPassword = `A1${basePassword}`; // Meets backend requirements (12+ chars, uppercase, lowercase, number)
      const username = currentAccount.address.substring(0, 12);

      // STEP 1: Try to LOGIN first (user might already exist from previous wallet creation)
      console.log('📡 Attempting to login to existing account...');
      const loginResponse = await fetch(`${environment.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: validPassword,
        }),
      });

      if (loginResponse.ok) {
        // LOGIN SUCCESSFUL - User already exists!
        const data = await loginResponse.json();
        await AsyncStorage.setItem('@aura50_auth_token', data.token);
        await AsyncStorage.setItem('@aura50_user_id', data.user.id);

        // Set user data
        walletService.setUser({
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          createdAt: new Date(data.user.createdAt || new Date()),
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

        console.log('✅ Logged in to existing account successfully');
        return true;
      }

      // STEP 2: Login failed, try to REGISTER (new user)
      console.log('📡 Login failed, registering new account...');
      const registerResponse = await fetch(`${environment.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: validPassword,
          firstName: 'Mobile',
          lastName: 'User',
          username,
        }),
      });

      if (registerResponse.ok) {
        const data = await registerResponse.json();
        await AsyncStorage.setItem('@aura50_auth_token', data.token);
        await AsyncStorage.setItem('@aura50_user_id', data.user.id);

        // Set user data
        walletService.setUser({
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
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

        console.log('✅ Registered new account successfully');
        return true;
      }

      // STEP 3: Both login and register failed, fallback to offline mode
      const error = await registerResponse.json();
      console.warn('⚠️ Backend authentication failed:', error.message);

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

    } catch (error) {
      console.error('❌ Authentication error:', error);
      Alert.alert(
        'Authentication Failed',
        'Could not connect to backend. You can still use the app in offline mode.',
        [
          { text: 'Continue Offline', onPress: () => setStep(3) },
          { text: 'Retry', onPress: () => registerWithBackend() }
        ]
      );
      return false;
    } finally {
      setIsRestoring(false);
    }
  };

  const handleComplete = async () => {
    const success = await registerWithBackend();
    if (success) {
      setStep(3);
    }
  };

  const renderStep1 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="download-outline" size={64} color="#667eea" />
      </View>

      <Text style={styles.stepTitle}>Restore Wallet</Text>
      <Text style={styles.stepDescription}>
        Enter your 24-word recovery phrase to restore your AURA50 wallet.
      </Text>

      <View style={styles.inputModeToggle}>
        <TouchableOpacity
          style={[styles.toggleButton, useTextInput && styles.toggleButtonActive]}
          onPress={() => setUseTextInput(true)}
        >
          <Text style={[styles.toggleButtonText, useTextInput && styles.toggleButtonTextActive]}>
            Text Input
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, !useTextInput && styles.toggleButtonActive]}
          onPress={() => setUseTextInput(false)}
        >
          <Text style={[styles.toggleButtonText, !useTextInput && styles.toggleButtonTextActive]}>
            Word by Word
          </Text>
        </TouchableOpacity>
      </View>

      {useTextInput ? (
        <View style={styles.textInputContainer}>
          <TextInput
            style={styles.mnemonicTextInput}
            placeholder="Enter your 24 words separated by spaces"
            placeholderTextColor="#95A5A6"
            multiline
            numberOfLines={6}
            value={mnemonicInput}
            onChangeText={setMnemonicInput}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <Text style={styles.wordCount}>
            Words: {mnemonicInput.trim().split(' ').filter(w => w.length > 0).length} / 24
          </Text>
        </View>
      ) : (
        <View style={styles.wordInputContainer}>
          {mnemonicWords.map((word, index) => (
            <View key={index} style={styles.wordInputWrapper}>
              <Text style={styles.wordInputLabel}>{index + 1}</Text>
              <TextInput
                style={styles.wordInput}
                placeholder={`Word ${index + 1}`}
                placeholderTextColor="#95A5A6"
                value={word}
                onChangeText={(text) => updateWord(index, text)}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
              />
            </View>
          ))}
        </View>
      )}

      <View style={styles.warningBox}>
        <Ionicons name="shield-checkmark" size={24} color="#E67E22" />
        <Text style={styles.warningText}>
          Never share your recovery phrase with anyone. AURA50 support will never ask for it.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isRestoring && styles.disabledButton]}
        onPress={handleRestore}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.primaryButtonText}>  Restoring...</Text>
          </>
        ) : (
          <>
            <Text style={styles.primaryButtonText}>Restore Wallet</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.goBack()}
        disabled={isRestoring}
      >
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark-circle" size={64} color="#27AE60" />
      </View>

      <Text style={styles.stepTitle}>Wallet Restored!</Text>
      <Text style={styles.stepDescription}>
        Your wallet has been successfully restored. We'll now register it with the AURA50 network.
      </Text>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={24} color="#3498DB" />
        <Text style={styles.infoText}>
          Registering your wallet enables block participation, transactions, and syncs your balance with the network.
        </Text>
      </View>

      <View style={styles.addressBox}>
        <Text style={styles.addressLabel}>Your Wallet Address:</Text>
        <Text style={styles.addressText}>
          {EnhancedWalletService.getInstance().getCurrentAccount()?.address || 'Loading...'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isRestoring && styles.disabledButton]}
        onPress={handleComplete}
        disabled={isRestoring}
      >
        {isRestoring ? (
          <>
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={styles.primaryButtonText}>  Registering...</Text>
          </>
        ) : (
          <>
            <Text style={styles.primaryButtonText}>Register on Network</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => {
          if (onWalletRestored) {
            onWalletRestored();
          } else {
            navigation.navigate('Home');
          }
        }}
        disabled={isRestoring}
      >
        <Text style={styles.secondaryButtonText}>Skip Registration (Offline Mode)</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="rocket" size={64} color="#27AE60" />
      </View>

      <Text style={styles.successTitle}>All Set!</Text>
      <Text style={styles.stepDescription}>
        Your wallet has been restored and registered. You can now use all AURA50 features.
      </Text>

      <View style={styles.successBox}>
        <View style={styles.successItem}>
          <Ionicons name="checkmark-circle" size={32} color="#27AE60" />
          <Text style={styles.successText}>Wallet Restored</Text>
        </View>
        <View style={styles.successItem}>
          <Ionicons name="checkmark-circle" size={32} color="#27AE60" />
          <Text style={styles.successText}>Registered on Network</Text>
        </View>
        <View style={styles.successItem}>
          <Ionicons name="checkmark-circle" size={32} color="#27AE60" />
          <Text style={styles.successText}>Ready to Forge</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => {
          if (onWalletRestored) {
            onWalletRestored();
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
        <Text style={styles.headerTitle}>Restore Wallet</Text>
        <Text style={styles.headerSubtitle}>Step {step} of 3</Text>
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3].map((s) => (
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
      </ThemedCard>
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
  inputModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#667eea',
  },
  toggleButtonText: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: '#FFF',
  },
  textInputContainer: {
    marginBottom: 16,
  },
  mnemonicTextInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2C3E50',
    borderWidth: 1,
    borderColor: '#DEE2E6',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  wordCount: {
    fontSize: 14,
    color: '#7F8C8D',
    marginTop: 8,
    textAlign: 'right',
  },
  wordInputContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  wordInputWrapper: {
    width: '48%',
    marginBottom: 12,
  },
  wordInputLabel: {
    fontSize: 12,
    color: '#95A5A6',
    marginBottom: 4,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  wordInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2C3E50',
    borderWidth: 1,
    borderColor: '#DEE2E6',
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
  addressBox: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  addressLabel: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 8,
    fontWeight: '600',
  },
  addressText: {
    fontSize: 14,
    color: '#2C3E50',
    fontFamily: 'monospace',
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
});
