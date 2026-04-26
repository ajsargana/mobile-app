import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import ThemedCard from './ThemedCard';
import { EnhancedWalletService } from '../services/EnhancedWalletService';
import { config, getApiUrl } from '../config/environment';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrustLevel } from '../types';
import { QRScannerModal } from './QRScannerModal';
import NotificationService from '../services/NotificationService';
import { useTranslation } from 'react-i18next';
import { applyFontScaling } from '../utils/fontScaling';

const CONTACTS_KEY = '@aura50_contacts';

interface Contact { id: string; name: string; address: string }

export const SendTransactionScreen = ({ navigation, route }: any) => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const mountedRef = useRef(true);

  const [recipientAddress, setRecipientAddress] = useState(route?.params?.toAddress || '');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('0');
  const [fee, setFee] = useState('0');
  const [trustLevel, setTrustLevel] = useState<TrustLevel>(TrustLevel.NEW);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddr, setNewAddr] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    loadWalletData();
    loadContacts();
    return () => { mountedRef.current = false; };
  }, []);

  // Update fee when amount changes
  useEffect(() => {
    if (amount && parseFloat(amount) > 0) {
      const calculatedFee = calculateFee(amount, trustLevel);
      setFee(calculatedFee);
    } else {
      setFee('0');
    }
  }, [amount, trustLevel]);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      setError(null);

      const walletService = EnhancedWalletService.getInstance();

      // Get wallet balance — subtract any locked staking coins so they can't be sent
      const wallet = walletService.getCurrentAccount();
      if (wallet) {
        const { StakingService } = require('../services/StakingService');
        const available = StakingService.getInstance().getAvailableBalanceSync();
        if (mountedRef.current) setBalance(available.toFixed(8));
      }

      // Get user trust level from stored profile
      const userDataStr = await AsyncStorage.getItem('@user_data');
      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        if (mountedRef.current) setTrustLevel(userData.trustLevel || TrustLevel.NEW);
      }
    } catch (err) {
      console.error('Failed to load wallet data:', err);
      if (mountedRef.current) setError('Failed to load wallet data');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // ── Contacts ────────────────────────────────────────────────────────────────
  const loadContacts = async () => {
    try {
      const raw = await AsyncStorage.getItem(CONTACTS_KEY);
      if (raw && mountedRef.current) setContacts(JSON.parse(raw));
    } catch {}
  };

  const saveContact = async () => {
    if (!newName.trim() || !newAddr.trim()) {
      Alert.alert('Missing fields', 'Enter both name and wallet address.');
      return;
    }
    const c: Contact = { id: Date.now().toString(), name: newName.trim(), address: newAddr.trim() };
    const next = [...contacts, c];
    setContacts(next);
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
    setAddContactOpen(false);
    setNewName('');
    setNewAddr('');
  };

  const handleQRScan = (data: string) => {
    console.log('QR Code scanned:', data);
    setRecipientAddress(data);
    setShowScanner(false);
    Alert.alert('Success', 'Wallet address scanned successfully!');
  };

  const calculateFee = (sendAmount: string, trust: TrustLevel): string => {
    const amountNum = parseFloat(sendAmount);
    if (isNaN(amountNum) || amountNum <= 0) return '0';

    // Trust-based fee rates (AURA50's revolutionary feature)
    const feeRates = {
      [TrustLevel.NEW]: 0.001,        // 0.1%
      [TrustLevel.ESTABLISHED]: 0.0005, // 0.05%
      [TrustLevel.VETERAN]: 0.0001,    // 0.01%
      [TrustLevel.LEGEND]: 0.00001,    // 0.001%
    };

    const feeRate = feeRates[trust] || feeRates[TrustLevel.NEW];
    const feeAmount = amountNum * feeRate;

    return feeAmount.toFixed(8);
  };

  const validateTransaction = (): { valid: boolean; error?: string } => {
    // Validate recipient address
    if (!recipientAddress.trim()) {
      return { valid: false, error: 'Please enter recipient address' };
    }

    if (recipientAddress.length < 10) {
      return { valid: false, error: 'Invalid recipient address' };
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return { valid: false, error: 'Please enter a valid amount' };
    }

    // Validate sufficient balance
    const balanceNum = parseFloat(balance);
    const feeNum = parseFloat(fee);
    const totalRequired = amountNum + feeNum;

    if (totalRequired > balanceNum) {
      return {
        valid: false,
        error: `Insufficient balance. Required: ${totalRequired.toFixed(8)} A50 (including fee)`,
      };
    }

    return { valid: true };
  };

  const handleSendTransaction = async () => {
    // Validate transaction
    const validation = validateTransaction();
    if (!validation.valid) {
      Alert.alert('Validation Error', validation.error || 'Invalid transaction');
      return;
    }

    // Confirm transaction
    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} A50 to ${recipientAddress ? recipientAddress.substring(0, 10) : 'Unknown'}...?\n\nFee: ${fee} A50\nTotal: ${(parseFloat(amount) + parseFloat(fee)).toFixed(8)} A50`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => submitTransaction() },
      ]
    );
  };

  const submitTransaction = async () => {
    try {
      setSending(true);
      setError(null);

      const walletService = EnhancedWalletService.getInstance();
      const wallet = walletService.getCurrentAccount();
      const user = walletService.getUser();

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (!user) {
        throw new Error('User not found - please login again');
      }

      // Get auth token
      const token = await AsyncStorage.getItem('@aura50_auth_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Look up recipient wallet address if username was entered
      let recipientWalletAddress = recipientAddress;

      // AURA50 wallet addresses start with 'aura50' followed by hex
      // If input looks like a wallet address, use it directly
      const isWalletAddress = recipientAddress.match(/^aura50[a-fA-F0-9]{32}$/) ||
                              recipientAddress.match(/^[a-fA-F0-9]{32,64}$/) ||
                              recipientAddress.match(/^0x[a-fA-F0-9]{40}$/);

      // If NOT a wallet address, treat as username and look it up
      if (!isWalletAddress) {
        console.log('Looking up username:', recipientAddress);

        try {
          const lookupResponse = await fetch(
            getApiUrl(`/api/user/lookup?username=${encodeURIComponent(recipientAddress)}`),
            {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (!lookupResponse.ok) {
            throw new Error('User not found - check username');
          }

          const lookupData = await lookupResponse.json();

          if (!lookupData.walletAddress) {
            throw new Error('User has not synced wallet address yet');
          }

          recipientWalletAddress = lookupData.walletAddress;
          console.log('Found wallet address:', recipientWalletAddress);
        } catch (err: any) {
          throw new Error(err.message || 'Failed to find recipient wallet');
        }
      }

      // Fetch current user profile to get the correct nonce
      // Add timestamp to bypass cache and get fresh nonce value
      const profileResponse = await fetch(getApiUrl(`/api/user/profile?_t=${Date.now()}`), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch user profile for nonce');
      }

      const profileData = await profileResponse.json();
      const userNonce = profileData.transactionNonce || 0;

      console.log('Using transaction nonce:', userNonce);

      // Create transaction object for signing (don't save locally - server will handle storage)
      const transaction = await walletService.createTransactionForSigning(
        recipientWalletAddress,
        amount
      );

      // React Native compatible timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      let response;
      try {
        // Submit to backend with wallet addresses (proper blockchain way)
        response = await fetch(getApiUrl('/api/v1/transactions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            from: wallet.address,  // Send wallet address
            to: recipientWalletAddress,  // Recipient wallet address
            amount: amount,
            type: 'transfer',
            signature: transaction.signature,
            nonce: userNonce,  // Use the correct sequential nonce from server
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Transaction timeout - please try again');
        }
        throw fetchErr;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || 'Transaction failed');
      }

      console.log('✅ Transaction submitted successfully:', result.data?.transaction?.id);

      // Update local balance
      await walletService.syncBalanceFromBackend();

      // Store sent notification (bell badge + history)
      NotificationService.getInstance().triggerCoinSentNotification(
        amount, recipientWalletAddress, result.data?.transaction?.id
      ).catch(() => {});

      // Reset form
      setRecipientAddress('');
      setAmount('');
      setFee('0');
      loadWalletData();

      // Navigate to animated success / receipt screen
      navigation.replace('TransactionSuccess', {
        txId:         result.data?.transaction?.id ?? '',
        amount,
        fee,
        fromAddress:  wallet.address,
        toAddress:    recipientWalletAddress,
        toName:       isWalletAddress ? null : recipientAddress,
        timestamp:    result.data?.transaction?.timestamp ?? new Date().toISOString(),
        type:         'Sent',
        blockHeight:  result.data?.transaction?.blockHeight ?? result.data?.blockHeight ?? null,
        status:       result.data?.transaction?.status ?? 'pending',
        confirmations: result.data?.transaction?.confirmations ?? 0,
      });
    } catch (err: any) {
      console.error('Transaction failed:', err);

      let errorMessage = 'Failed to send transaction';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.name === 'AbortError') {
        errorMessage = 'Transaction timeout - please try again';
      }

      setError(errorMessage);
      Alert.alert('Transaction Failed', errorMessage);
    } finally {
      setSending(false);
    }
  };

  const getFeeColorAndText = (trust: TrustLevel): { color: string; text: string } => {
    const feeRates = {
      [TrustLevel.NEW]: { color: '#ef4444', text: '0.1% (New User)' },
      [TrustLevel.ESTABLISHED]: { color: '#f59e0b', text: '0.05% (Established)' },
      [TrustLevel.VETERAN]: { color: '#10b981', text: '0.01% (Veteran)' },
      [TrustLevel.LEGEND]: { color: '#3b82f6', text: '0.001% (Legend)' },
    };
    return feeRates[trust] || feeRates[TrustLevel.NEW];
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading wallet...</Text>
      </View>
    );
  }

  const feeInfo = getFeeColorAndText(trustLevel);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Send A50</Text>
          <Text style={[styles.smallBalanceText, { color: colors.textMuted }]}>
            Available: {parseFloat(balance).toFixed(8)} A50
          </Text>

          {/* ── Top Contacts ── */}
          <ThemedCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('home.topContacts')}</Text>
              <TouchableOpacity onPress={() => Alert.alert('Contacts', `${contacts.length} saved contact(s).`)}>
                <Text style={[styles.viewAllText, { color: colors.accent }]}>{t('home.viewAll')} {'>'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {contacts.map(c => (
                <TouchableOpacity key={c.id} style={styles.contactItem}
                  onPress={() => setRecipientAddress(c.address)}>
                  <View style={[styles.contactAvatar, { backgroundColor: colors.contactAvatarBg }]}>
                    <Text style={[styles.contactInitial, { color: colors.contactInitial }]}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.contactName, { color: colors.textMuted }]} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              ))}
              {/* Add contact card */}
              <TouchableOpacity style={[styles.addContactCard, { backgroundColor: colors.addContactCardBg, borderColor: colors.addContactBorder }]}
                onPress={() => setAddContactOpen(true)}>
                <Ionicons name="person-add-outline" size={20} color={colors.accent} />
                <Text style={[styles.addContactText, { color: colors.accent }]}>Add</Text>
              </TouchableOpacity>
            </ScrollView>
          </ThemedCard>
        </View>

        {/* Recipient Username/Wallet Address Input */}
        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Recipient Username or Wallet Address</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputWithButton, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              placeholder="Enter username or 0x... wallet address"
              placeholderTextColor={colors.placeholder}
              value={recipientAddress}
              onChangeText={setRecipientAddress}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sending}
            />
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => setShowScanner(true)}
              disabled={sending}
            >
              <Text style={styles.scanButtonText}>📷 Scan QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Amount Input */}
        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Amount (A50)</Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={[styles.amountInput, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              placeholder="0.00000000"
              placeholderTextColor={colors.placeholder}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!sending}
            />
            <TouchableOpacity
              style={styles.maxButton}
              onPress={() => {
                const maxAmount = Math.max(0, parseFloat(balance) * 0.999); // Leave room for fee
                setAmount(maxAmount.toFixed(8));
              }}
              disabled={sending}
            >
              <Text style={styles.maxButtonText}>MAX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fee Information */}
        <ThemedCard style={styles.feeSection}>
          <View style={styles.feeRow}>
            <Text style={[styles.feeLabel, { color: colors.textMuted }]}>Transaction Fee</Text>
            <Text style={[styles.feeValue, { color: feeInfo.color }]}>
              {parseFloat(fee).toFixed(8)} A50
            </Text>
          </View>
          <Text style={[styles.feeRate, { color: feeInfo.color }]}>
            {feeInfo.text}
          </Text>
          <View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />
          <View style={styles.feeRow}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.textPrimary }]}>
              {(parseFloat(amount || '0') + parseFloat(fee)).toFixed(8)} A50
            </Text>
          </View>
        </ThemedCard>

        {/* Error Message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2' }]}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={[styles.errorText, { color: isDark ? '#F87171' : '#991b1b' }]}>{error}</Text>
          </View>
        )}

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            sending && styles.sendButtonDisabled,
          ]}
          onPress={handleSendTransaction}
          disabled={sending}
        >
          {sending ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={styles.buttonLoader} />
              <Text style={styles.sendButtonText}>Sending...</Text>
            </>
          ) : (
            <Text style={styles.sendButtonText}>Send Transaction</Text>
          )}
        </TouchableOpacity>

        {/* Trust Level Info */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#dbeafe' }]}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={[styles.infoText, { color: isDark ? '#60A5FA' : '#1e40af' }]}>
            Your transaction fee is {feeInfo.text.toLowerCase()} based on your trust level.
            Trust increases with participation time!
          </Text>
        </View>
      </ScrollView>

      {/* Add Contact Modal */}
      <Modal visible={addContactOpen} transparent animationType="slide" onRequestClose={() => setAddContactOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setAddContactOpen(false)}>
            <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.card }]}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add Contact</Text>

              <Text style={[styles.inputLabel, { color: colors.textLabel }]}>Name</Text>
              <TextInput
                style={[styles.sheetInput, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                placeholder="Contact name" placeholderTextColor={colors.placeholder}
                value={newName} onChangeText={setNewName} />

              <Text style={[styles.inputLabel, { color: colors.textLabel }]}>Wallet Address</Text>
              <TextInput
                style={[styles.sheetInput, { color: colors.textPrimary, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                placeholder="0x..." placeholderTextColor={colors.placeholder}
                value={newAddr} onChangeText={setNewAddr} autoCapitalize="none" autoCorrect={false} />

              <View style={styles.sheetBtns}>
                <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.pillBg }]} onPress={() => setAddContactOpen(false)}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.accent }]} onPress={saveContact}>
                  <Text style={styles.confirmBtnText}>Add Contact</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQRScan}
        title="Scan Wallet Address"
        subtitle="Position the QR code within the frame"
      />
    </KeyboardAvoidingView>
  );
};

const styles = applyFontScaling(StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  smallBalanceText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  sectionCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  viewAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '500',
  },
  // Contacts
  contactItem: { alignItems: 'center', marginRight: 14, width: 56 },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  contactInitial: { fontSize: 18, fontWeight: '700', color: '#2563EB' },
  contactName: { fontSize: 11, color: '#6B7280', textAlign: 'center', fontWeight: '500' },
  addContactCard: { alignItems: 'center', justifyContent: 'center', width: 56, height: 70, borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE', borderStyle: 'dashed', gap: 3 },
  addContactText: { fontSize: 11, color: '#2563EB', fontWeight: '600' },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inputWithButton: {
    flex: 1,
  },
  scanButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  maxButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
  },
  maxButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  feeSection: {
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feeLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  feeValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  feeRate: {
    fontSize: 12,
    marginBottom: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorIcon: {
    fontSize: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#991b1b',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0.1,
  },
  buttonLoader: {
    marginRight: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  infoIcon: {
    fontSize: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
  // Modal styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#111827',
  },
  sheetInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 14,
    color: '#111827',
  },
  sheetBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#3b82f6',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
}));
