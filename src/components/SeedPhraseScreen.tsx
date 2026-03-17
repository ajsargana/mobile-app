import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Clipboard,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';

const { width } = Dimensions.get('window');

interface SeedPhraseScreenProps {
  navigation: any;
  route: any;
}

export const SeedPhraseScreen: React.FC<SeedPhraseScreenProps> = ({ navigation, route }) => {
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationWords, setVerificationWords] = useState<string[]>([]);
  const [userInputWords, setUserInputWords] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<'display' | 'verify' | 'complete'>('display');

  const { colors, isDark } = useTheme();
  const walletService = EnhancedWalletService.getInstance();
  const { mode = 'create' } = route.params || {}; // 'create' or 'restore'

  useEffect(() => {
    if (mode === 'create') {
      loadSeedPhrase();
    }
  }, []);

  const loadSeedPhrase = async () => {
    try {
      const mnemonic = await walletService.getMnemonic();
      const words = walletService.getSeedPhraseWords(mnemonic);
      setSeedWords(words);
    } catch (error) {
      Alert.alert('Error', 'Failed to load seed phrase');
    }
  };

  const revealSeedPhrase = () => {
    Alert.alert(
      'Security Warning',
      'Never share your seed phrase with anyone. Anyone with your seed phrase can access your wallet and steal your funds.',
      [
        { text: 'I Understand', onPress: () => setIsRevealed(true) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const copySeedPhrase = async () => {
    try {
      const seedPhrase = seedWords.join(' ');
      await Clipboard.setString(seedPhrase);

      if (Platform.OS === 'ios') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Alert.alert('Copied', 'Seed phrase copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy seed phrase');
    }
  };

  const startVerification = () => {
    // Select 4 random words for verification
    const randomIndices = [];
    while (randomIndices.length < 4) {
      const randomIndex = Math.floor(Math.random() * seedWords.length);
      if (!randomIndices.includes(randomIndex)) {
        randomIndices.push(randomIndex);
      }
    }

    const wordsToVerify = randomIndices.map(index => ({
      index: index + 1,
      word: seedWords[index]
    }));

    setVerificationWords(wordsToVerify.map(w => w.word));
    setUserInputWords(new Array(4).fill(''));
    setCurrentStep('verify');
  };

  const updateUserInput = (index: number, value: string) => {
    const newUserInputWords = [...userInputWords];
    newUserInputWords[index] = value.toLowerCase().trim();
    setUserInputWords(newUserInputWords);
  };

  const verifyUserInput = () => {
    const isCorrect = verificationWords.every((word, index) =>
      word.toLowerCase() === userInputWords[index].toLowerCase()
    );

    if (isCorrect) {
      setCurrentStep('complete');
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      Alert.alert(
        'Verification Failed',
        'The words you entered don\'t match your seed phrase. Please try again.',
        [{ text: 'Try Again', onPress: () => startVerification() }]
      );
    }
  };

  const completeSetup = () => {
    Alert.alert(
      'Wallet Setup Complete',
      'Your wallet has been created successfully. Keep your seed phrase safe!',
      [
        {
          text: 'Continue',
          onPress: () => navigation.navigate('MainTabs')
        }
      ]
    );
  };

  const restoreFromSeedPhrase = async () => {
    if (userInputWords.length !== 12 && userInputWords.length !== 24) {
      Alert.alert('Error', 'Please enter 12 or 24 words');
      return;
    }

    const mnemonic = userInputWords.join(' ');

    if (!await walletService.validateSeedPhrase(mnemonic)) {
      Alert.alert('Error', 'Invalid seed phrase. Please check your words and try again.');
      return;
    }

    try {
      setIsVerifying(true);
      await walletService.importWallet(mnemonic);

      Alert.alert(
        'Wallet Restored',
        'Your wallet has been successfully restored from seed phrase.',
        [
          {
            text: 'Continue',
            onPress: () => navigation.navigate('MainTabs')
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to restore wallet from seed phrase');
    } finally {
      setIsVerifying(false);
    }
  };

  const renderDisplayStep = () => (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <Ionicons name="shield-checkmark" size={48} color="#FFF" />
        <Text style={styles.headerTitle}>Your Seed Phrase</Text>
        <Text style={styles.headerSubtitle}>
          This is the key to your wallet. Keep it safe and never share it.
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        {/* Security Warning */}
        <View style={[styles.warningContainer, { backgroundColor: isDark ? 'rgba(231,76,60,0.15)' : '#FFF5F5' }]}>
          <Ionicons name="warning" size={24} color="#E74C3C" />
          <View style={styles.warningText}>
            <Text style={styles.warningTitle}>Important Security Notice</Text>
            <Text style={[styles.warningMessage, { color: isDark ? '#F87171' : '#C0392B' }]}>
              • Never share your seed phrase with anyone{'\n'}
              • Store it offline in a secure location{'\n'}
              • Anyone with this phrase can access your wallet{'\n'}
              • AURA5O will never ask for your seed phrase
            </Text>
          </View>
        </View>

        {/* Seed Phrase Display */}
        <ThemedCard style={styles.seedContainer}>
          <Text style={[styles.seedTitle, { color: colors.textPrimary }]}>Your 24-Word Seed Phrase</Text>

          {!isRevealed ? (
            <View style={styles.hiddenSeedContainer}>
              <Ionicons name="eye-off" size={48} color="#BDC3C7" />
              <Text style={[styles.hiddenSeedText, { color: colors.textMuted }]}>
                Tap to reveal your seed phrase
              </Text>
              <TouchableOpacity style={styles.revealButton} onPress={revealSeedPhrase}>
                <Text style={styles.revealButtonText}>Reveal Seed Phrase</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.revealedSeedContainer}>
              <View style={styles.seedWordsGrid}>
                {seedWords.map((word, index) => (
                  <View key={index} style={[styles.seedWordItem, { backgroundColor: colors.card2 }]}>
                    <Text style={[styles.seedWordNumber, { color: colors.textMuted }]}>{index + 1}</Text>
                    <Text style={[styles.seedWordText, { color: colors.textPrimary }]}>{word}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={[styles.copyButton, { backgroundColor: isDark ? 'rgba(52,152,219,0.15)' : '#EBF8FF', borderColor: '#3498DB' }]} onPress={copySeedPhrase}>
                <Ionicons name="copy" size={20} color="#3498DB" />
                <Text style={styles.copyButtonText}>Copy to Clipboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ThemedCard>

        {/* Action Buttons */}
        {isRevealed && (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={startVerification}
            >
              <Text style={styles.primaryButtonText}>I've Saved My Seed Phrase</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}
              onPress={() => setIsRevealed(false)}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Hide Seed Phrase</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderVerifyStep = () => (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={['#4ECDC4', '#44A08D']}
        style={styles.header}
      >
        <Ionicons name="checkmark-circle" size={48} color="#FFF" />
        <Text style={styles.headerTitle}>Verify Seed Phrase</Text>
        <Text style={styles.headerSubtitle}>
          Enter the requested words to confirm you've saved your seed phrase
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        <Text style={[styles.verifyTitle, { color: colors.textPrimary }]}>
          Please enter the following words from your seed phrase:
        </Text>

        <View style={styles.verificationContainer}>
          {verificationWords.map((word, index) => {
            const wordNumber = seedWords.indexOf(word) + 1;
            return (
              <View key={index} style={styles.verificationItem}>
                <Text style={[styles.verificationLabel, { color: colors.textMuted }]}>
                  Word #{wordNumber}
                </Text>
                <TextInput
                  style={[styles.verificationInput, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.textPrimary }]}
                  value={userInputWords[index]}
                  onChangeText={(text) => updateUserInput(index, text)}
                  placeholder="Enter word"
                  placeholderTextColor="#566573"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              userInputWords.some(word => !word) && styles.disabledButton
            ]}
            onPress={verifyUserInput}
            disabled={userInputWords.some(word => !word)}
          >
            <Text style={styles.primaryButtonText}>Verify</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}
            onPress={() => setCurrentStep('display')}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Back to Seed Phrase</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  const renderCompleteStep = () => (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={['#27AE60', '#2ECC71']}
        style={styles.header}
      >
        <Ionicons name="checkmark-circle" size={64} color="#FFF" />
        <Text style={styles.headerTitle}>Wallet Created!</Text>
        <Text style={styles.headerSubtitle}>
          Your AURA5O wallet is ready to use
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.successContainer}>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Setup Complete</Text>
          <Text style={[styles.successMessage, { color: colors.textMuted }]}>
            Your wallet has been created successfully. You can now:
          </Text>

          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="wallet" size={20} color="#27AE60" />
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>Send and receive DIG</Text>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="flash" size={20} color="#27AE60" />
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>Start block participation</Text>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="people" size={20} color="#27AE60" />
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>Connect to P2P network</Text>
            </View>

            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={20} color="#27AE60" />
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>Build trust over time</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={completeSetup}>
          <Text style={styles.primaryButtonText}>Start Using AURA5O</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRestoreMode = () => (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={['#3498DB', '#2980B9']}
        style={styles.header}
      >
        <Ionicons name="download" size={48} color="#FFF" />
        <Text style={styles.headerTitle}>Restore Wallet</Text>
        <Text style={styles.headerSubtitle}>
          Enter your 12 or 24-word seed phrase to restore your wallet
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        <Text style={[styles.restoreTitle, { color: colors.textPrimary }]}>
          Enter Your Seed Phrase
        </Text>

        <View style={styles.restoreInputContainer}>
          <TextInput
            style={[styles.restoreTextArea, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.textPrimary }]}
            value={userInputWords.join(' ')}
            onChangeText={(text) => {
              const words = text.toLowerCase().split(' ').filter(word => word.length > 0);
              setUserInputWords(words);
            }}
            placeholder="Enter your seed phrase words separated by spaces..."
            placeholderTextColor="#BDC3C7"
            multiline
            numberOfLines={6}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.wordCount, { color: colors.textMuted }]}>
            Words entered: {userInputWords.length}/24
          </Text>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (userInputWords.length < 12 || isVerifying) && styles.disabledButton
            ]}
            onPress={restoreFromSeedPhrase}
            disabled={userInputWords.length < 12 || isVerifying}
          >
            <Text style={styles.primaryButtonText}>
              {isVerifying ? 'Restoring...' : 'Restore Wallet'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  if (mode === 'restore') {
    return renderRestoreMode();
  }

  switch (currentStep) {
    case 'display':
      return renderDisplayStep();
    case 'verify':
      return renderVerifyStep();
    case 'complete':
      return renderCompleteStep();
    default:
      return renderDisplayStep();
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  warningContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF5F5',
    borderColor: '#E74C3C',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E74C3C',
    marginBottom: 8,
  },
  warningMessage: {
    fontSize: 14,
    color: '#C0392B',
    lineHeight: 20,
  },
  seedContainer: {
    marginBottom: 24,
  },
  seedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 20,
  },
  hiddenSeedContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  hiddenSeedText: {
    fontSize: 16,
    color: '#7F8C8D',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  revealButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  revealButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  revealedSeedContainer: {
    alignItems: 'center',
  },
  seedWordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  seedWordItem: {
    width: '48%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  seedWordNumber: {
    fontSize: 12,
    color: '#7F8C8D',
    width: 20,
  },
  seedWordText: {
    fontSize: 16,
    color: '#2C3E50',
    fontWeight: '500',
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF8FF',
    borderColor: '#3498DB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  copyButtonText: {
    color: '#3498DB',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  verifyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 24,
  },
  verificationContainer: {
    marginBottom: 32,
  },
  verificationItem: {
    marginBottom: 16,
  },
  verificationLabel: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 8,
  },
  verificationInput: {
    backgroundColor: '#FFF',
    borderColor: '#ECF0F1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2C3E50',
  },
  actionContainer: {
    marginTop: 32,
  },
  primaryButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: '#BDC3C7',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
  },
  secondaryButtonText: {
    color: '#7F8C8D',
    fontSize: 16,
    textAlign: 'center',
  },
  disabledButton: {
    backgroundColor: '#BDC3C7',
  },
  successContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  featuresList: {
    alignSelf: 'stretch',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 12,
  },
  restoreTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 20,
  },
  restoreInputContainer: {
    marginBottom: 32,
  },
  restoreTextArea: {
    backgroundColor: '#FFF',
    borderColor: '#ECF0F1',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2C3E50',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  wordCount: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'right',
    marginTop: 8,
  },
});