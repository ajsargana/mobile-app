import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as bip39Scure from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { MobileWallet, Transaction, User, TrustLevel } from '../types';
import config, { getApiUrl, API_ENDPOINTS } from '../config/environment';

// Lazy load wordlist to avoid import-time errors
let _wordlist: string[] | null = null;
const getWordlist = async (): Promise<string[]> => {
  if (!_wordlist) {
    const module = await import('@scure/bip39/wordlists/english');
    _wordlist = module.wordlist;
  }
  return _wordlist;
};

export interface HDWallet {
  mnemonic: string;
  seed: Uint8Array;
  masterKey: HDKey;
  accounts: HDAccount[];
  currentAccountIndex: number;
}

export interface HDAccount {
  index: number;
  address: string;
  privateKey: string;
  publicKey: string;
  balance: string;
  transactions: Transaction[];
}

export interface WalletBackup {
  mnemonic: string;
  timestamp: Date;
  accounts: number;
  encrypted: boolean;
  version: string;
}

export class EnhancedWalletService {
  private static instance: EnhancedWalletService;
  private hdWallet: HDWallet | null = null;
  private currentAccount: HDAccount | null = null;
  private user: User | null = null;

  // AURA50-specific derivation path (following BIP-44)
  private readonly DERIVATION_PATH = "m/44'/1337'/0'/0"; // 1337 = AURA50 coin type

  private constructor() {}

  static getInstance(): EnhancedWalletService {
    if (!EnhancedWalletService.instance) {
      EnhancedWalletService.instance = new EnhancedWalletService();
    }
    return EnhancedWalletService.instance;
  }

  // Wallet Creation with Seed Phrase
  async createWallet(customMnemonic?: string): Promise<HDWallet> {
    try {
      const wordlist = await getWordlist();

      // Generate or use custom mnemonic
      const mnemonic = customMnemonic || bip39Scure.generateMnemonic(wordlist, 256); // 24 words for maximum security

      if (!bip39Scure.validateMnemonic(mnemonic, wordlist)) {
        throw new Error('Invalid mnemonic phrase');
      }

      // Generate seed from mnemonic
      const seed = bip39Scure.mnemonicToSeedSync(mnemonic);

      // Create master key
      const masterKey = HDKey.fromMasterSeed(seed);

      // Create HD wallet structure
      const hdWallet: HDWallet = {
        mnemonic,
        seed,
        masterKey,
        accounts: [],
        currentAccountIndex: 0
      };

      // Create first account
      const firstAccount = await this.deriveAccount(hdWallet, 0);
      hdWallet.accounts.push(firstAccount);

      // Save wallet securely
      await this.saveHDWallet(hdWallet);
      this.hdWallet = hdWallet;
      this.currentAccount = firstAccount;

      // Clear any cached staking data from a previous account so the new
      // wallet starts clean and doesn't inherit another account's boost.
      const { default: StakingService } = await import('./StakingService');
      StakingService.getInstance().resetForAccountSwitch();

      return hdWallet;
    } catch (error) {
      throw new Error(`Failed to create HD wallet: ${error}`);
    }
  }

  // Import Wallet from Seed Phrase
  async importWallet(mnemonic: string, accountsToRecover: number = 5): Promise<HDWallet> {
    try {
      const wordlist = await getWordlist();

      if (!bip39Scure.validateMnemonic(mnemonic, wordlist)) {
        throw new Error('Invalid seed phrase');
      }

      // Create wallet from mnemonic
      const hdWallet = await this.createWallet(mnemonic);

      // Recover additional accounts
      for (let i = 1; i < accountsToRecover; i++) {
        const account = await this.deriveAccount(hdWallet, i);

        // Check if account has transactions (balance or history)
        const hasActivity = await this.checkAccountActivity(account);
        if (hasActivity) {
          hdWallet.accounts.push(account);
        }
      }

      return hdWallet;
    } catch (error) {
      throw new Error(`Failed to import wallet: ${error}`);
    }
  }

  // Restore Wallet (alias for importWallet for clarity)
  async restoreWallet(mnemonic: string, accountsToRecover: number = 5): Promise<HDWallet> {
    return this.importWallet(mnemonic, accountsToRecover);
  }

  // Derive New Account (BIP-44 compliant)
  private async deriveAccount(hdWallet: HDWallet, accountIndex: number): Promise<HDAccount> {
    try {
      // Derive account key: m/44'/1337'/0'/0/accountIndex
      const path = `${this.DERIVATION_PATH}/${accountIndex}`;
      const accountKey = hdWallet.masterKey.derive(path);

      if (!accountKey.privateKey || !accountKey.publicKey) {
        throw new Error('Failed to derive keys');
      }

      // Generate address from public key
      const address = this.deriveAURA5OAddress(accountKey.publicKey);

      // Convert Uint8Array to hex
      const privateKeyHex = Buffer.from(accountKey.privateKey).toString('hex');
      const publicKeyHex = Buffer.from(accountKey.publicKey).toString('hex');

      const account: HDAccount = {
        index: accountIndex,
        address,
        privateKey: privateKeyHex,
        publicKey: publicKeyHex,
        balance: '0',
        transactions: []
      };

      return account;
    } catch (error) {
      throw new Error(`Failed to derive account: ${error}`);
    }
  }

  // AURA5O-specific address derivation
  private deriveAURA5OAddress(publicKey: Uint8Array): string {
    // AURA5O uses a simplified address format
    // Use a simple hash of the public key
    const publicKeyHex = Buffer.from(publicKey).toString('hex');
    const address = 'aura50' + publicKeyHex.slice(0, 32);
    return address;
  }

  // Create New Account
  async createNewAccount(): Promise<HDAccount> {
    if (!this.hdWallet) {
      throw new Error('No HD wallet available');
    }

    const newIndex = this.hdWallet.accounts.length;
    const newAccount = await this.deriveAccount(this.hdWallet, newIndex);

    this.hdWallet.accounts.push(newAccount);
    await this.saveHDWallet(this.hdWallet);

    return newAccount;
  }

  // Switch Active Account
  async switchAccount(accountIndex: number): Promise<HDAccount> {
    if (!this.hdWallet || !this.hdWallet.accounts[accountIndex]) {
      throw new Error('Account not found');
    }

    this.hdWallet.currentAccountIndex = accountIndex;
    this.currentAccount = this.hdWallet.accounts[accountIndex];

    await this.saveHDWallet(this.hdWallet);

    // Reset staking cache so the new account's stake is loaded fresh.
    // Without this, the previous account's staking boost leaks into shares
    // submitted under the new account.
    const { default: StakingService } = await import('./StakingService');
    StakingService.getInstance().resetForAccountSwitch();

    return this.currentAccount;
  }

  // Backup Wallet (Encrypted)
  async createEncryptedBackup(password: string): Promise<string> {
    if (!this.hdWallet) {
      throw new Error('No wallet to backup');
    }

    const backup: WalletBackup = {
      mnemonic: this.hdWallet.mnemonic,
      timestamp: new Date(),
      accounts: this.hdWallet.accounts.length,
      encrypted: true,
      version: '1.0.0'
    };

    // Encrypt the backup
    const encryptedBackup = await this.encryptData(JSON.stringify(backup), password);
    return encryptedBackup;
  }

  // Restore from Encrypted Backup
  async restoreFromEncryptedBackup(encryptedBackup: string, password: string): Promise<HDWallet> {
    try {
      const decryptedData = await this.decryptData(encryptedBackup, password);
      const backup: WalletBackup = JSON.parse(decryptedData);

      if (!backup.mnemonic) {
        throw new Error('Invalid backup format');
      }

      return await this.importWallet(backup.mnemonic, backup.accounts);
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error}`);
    }
  }

  // Transaction Methods

  // Create transaction for signing only - does NOT save locally
  // Use this when submitting to server (server handles storage)
  async createTransactionForSigning(
    to: string,
    amount: string
  ): Promise<Transaction> {
    if (!this.currentAccount) {
      throw new Error('No active account');
    }

    const fee = this.calculateFee(amount);
    const transaction: Transaction = {
      id: this.generateId(),
      from: this.currentAccount.address,
      to,
      amount,
      fee,
      timestamp: new Date(),
      status: 'pending',
      signature: ''
    };

    // Sign transaction with current account's private key
    transaction.signature = await this.signTransaction(transaction);

    // Return without saving - server will handle storage
    return transaction;
  }

  // Create and save transaction locally (for offline mode)
  async createTransaction(
    to: string,
    amount: string,
    isOffline: boolean = false
  ): Promise<Transaction> {
    if (!this.currentAccount) {
      throw new Error('No active account');
    }

    const fee = this.calculateFee(amount);
    const transaction: Transaction = {
      id: this.generateId(),
      from: this.currentAccount.address,
      to,
      amount,
      fee,
      timestamp: new Date(),
      status: isOffline ? 'offline' : 'pending',
      signature: ''
    };

    // Sign transaction with current account's private key
    transaction.signature = await this.signTransaction(transaction);

    // Add to appropriate transaction list
    if (isOffline) {
      // Store offline transaction
      await this.addOfflineTransaction(transaction);
    } else {
      if (!this.currentAccount.transactions.some(t => t.id === transaction.id)) {
        this.currentAccount.transactions.push(transaction);
      }
      await this.saveHDWallet(this.hdWallet!);
    }

    return transaction;
  }

  // Sign Transaction
  async signTransaction(transaction: Transaction): Promise<string> {
    if (!this.currentAccount) {
      throw new Error('No active account');
    }

    const txData = JSON.stringify({
      from: transaction.from,
      to: transaction.to,
      amount: transaction.amount,
      fee: transaction.fee,
      timestamp: transaction.timestamp.toISOString()
    });

    // Simple hash-based signature for mobile
    // In production, use proper ECDSA signing with @scure/bip32
    const privateKeyBuffer = Buffer.from(this.currentAccount.privateKey, 'hex');
    const dataBuffer = Buffer.from(txData);

    // Create a simple signature by hashing (privateKey + txData)
    const signatureData = Buffer.concat([privateKeyBuffer, dataBuffer]);
    let hash = 0;
    for (let i = 0; i < signatureData.length; i++) {
      hash = ((hash << 5) - hash) + signatureData[i];
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  // Seed Phrase Management
  async getMnemonic(): Promise<string> {
    if (!this.hdWallet) {
      throw new Error('No wallet available');
    }
    return this.hdWallet.mnemonic;
  }

  async validateSeedPhrase(mnemonic: string): Promise<boolean> {
    const wordlist = await getWordlist();
    return bip39Scure.validateMnemonic(mnemonic, wordlist);
  }

  // Get Seed Phrase Words as Array
  getSeedPhraseWords(mnemonic: string): string[] {
    return mnemonic.split(' ');
  }

  // Verify Seed Phrase by User Input
  verifySeedPhrase(originalMnemonic: string, userInputWords: string[]): boolean {
    const original = originalMnemonic.split(' ');

    if (original.length !== userInputWords.length) {
      return false;
    }

    return original.every((word, index) =>
      word.toLowerCase() === userInputWords[index].toLowerCase()
    );
  }

  // Balance and Account Management
  async updateBalance(newBalance: string, accountIndex?: number): Promise<void> {
    const account = accountIndex !== undefined
      ? this.hdWallet?.accounts[accountIndex]
      : this.currentAccount;

    if (!account) {
      throw new Error('Account not found');
    }

    account.balance = newBalance;

    if (this.hdWallet) {
      await this.saveHDWallet(this.hdWallet);
    }
  }

  // Sync Balance from Backend
  async syncBalanceFromBackend(): Promise<{ success: boolean; balance?: string; error?: string }> {
    try {
      const authToken = await AsyncStorage.getItem('@aura50_auth_token');

      if (!authToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      let response;
      try {
        response = await fetch(`${config.baseUrl}/api/user/profile`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        if (response.status === 401) {
          await AsyncStorage.removeItem('@aura50_auth_token');
          return { success: false, error: 'Not authenticated - token expired. Working in offline mode.' };
        }
        return { success: false, error: `HTTP ${response.status}` };
      }

      const profileData = await response.json();

      if (profileData.coinBalance !== undefined) {
        const newBalance = profileData.coinBalance.toString();
        await this.updateBalance(newBalance);

        if (this.user) {
          this.user.balance = newBalance;
          if (profileData.totalMined !== undefined) {
            await AsyncStorage.setItem('@aura50_total_mined', profileData.totalMined.toString());
          }
        }

        return { success: true, balance: newBalance };
      }

      return { success: false, error: 'No balance in response' };
    } catch (error) {
      console.error('Error syncing balance from backend:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Sync Transaction History from Backend
  async syncTransactionsFromBackend(limit = 20): Promise<{ success: boolean; transactions?: Transaction[]; error?: string }> {
    try {
      const authToken = await AsyncStorage.getItem('@aura50_auth_token');

      if (!authToken) {
        // No auth token — fall back to cache before giving up
        const cached = await AsyncStorage.getItem('@aura50_transaction_cache');
        if (cached) {
          const transactions: Transaction[] = JSON.parse(cached).map((tx: any) => ({
            ...tx,
            timestamp: new Date(tx.timestamp),
          }));
          if (this.currentAccount) {
            this.currentAccount.transactions = transactions;
          }
          return { success: true, transactions };
        }
        return { success: false, error: 'Not authenticated' };
      }

      const url = `${getApiUrl(API_ENDPOINTS.transactionHistory)}?limit=${limit}&offset=0`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      let response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        if (response.status === 401) {
          await AsyncStorage.removeItem('@aura50_auth_token');
          return { success: false, error: 'Not authenticated - token expired' };
        }
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.transactions)) {
        const transactions: Transaction[] = data.transactions.map((tx: any) => ({
          id: tx.id,
          from: tx.from || '',
          to: tx.to || '',
          amount: tx.amount || '0',
          fee: tx.fee || '0',
          timestamp: new Date(tx.timestamp),
          status: tx.status || 'pending',
          blockHeight: tx.blockHeight || undefined,
          signature: tx.signature || undefined,
          type: tx.type || 'transfer',
          direction: tx.direction || undefined,
          typeLabel: tx.typeLabel || undefined,
          confirmations: tx.confirmations || 0,
          confirmationStatus: tx.confirmationStatus || 'pending',
          isVerified: tx.isVerified || false,
          isFinal: tx.isFinal || false,
        }));

        if (this.currentAccount) {
          this.currentAccount.transactions = transactions;
          if (this.hdWallet) {
            await this.saveHDWallet(this.hdWallet);
          }
        }

        // Write to all cache keys so WalletScreen and TransactionHistoryScreen share the same data
        const serialized = JSON.stringify(transactions);
        const walletAddress = this.currentAccount?.address;
        const writes: Promise<void>[] = [
          AsyncStorage.setItem('@aura50_transaction_cache', serialized),
          AsyncStorage.setItem('@aura50_cached_transactions', serialized),
        ];
        if (walletAddress) {
          writes.push(AsyncStorage.setItem(`@aura50_cached_transactions_${walletAddress}`, serialized));
        }
        await Promise.all(writes);

        return { success: true, transactions };
      }

      return { success: false, error: 'No transactions in response' };
    } catch (error) {
      console.error('Error syncing transactions from backend:', error);

      // Try offline cache
      try {
        const cached = await AsyncStorage.getItem('@aura50_transaction_cache');
        if (cached) {
          const transactions = JSON.parse(cached);
          if (this.currentAccount) {
            this.currentAccount.transactions = transactions;
          }
          return { success: true, transactions };
        }
      } catch (_) {}

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getBalance(accountIndex?: number): string {
    const account = accountIndex !== undefined
      ? this.hdWallet?.accounts[accountIndex]
      : this.currentAccount;

    return account?.balance || '0';
  }

  // Trust Level Management
  calculateTrustLevel(user: User): TrustLevel {
    const daysSinceCreation = Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceCreation >= 1095) return TrustLevel.LEGEND; // 3+ years
    if (daysSinceCreation >= 365) return TrustLevel.VETERAN;  // 1+ year
    if (daysSinceCreation >= 30) return TrustLevel.ESTABLISHED; // 1+ month
    return TrustLevel.NEW;
  }

  calculateTransactionFee(amount: string, trustLevel: TrustLevel): string {
    const baseAmount = parseFloat(amount);
    let feeRate: number;

    switch (trustLevel) {
      case TrustLevel.LEGEND:
        feeRate = 0.00001; // 0.001%
        break;
      case TrustLevel.VETERAN:
        feeRate = 0.0001; // 0.01%
        break;
      case TrustLevel.ESTABLISHED:
        feeRate = 0.0005; // 0.05%
        break;
      case TrustLevel.NEW:
      default:
        feeRate = 0.001; // 0.1%
        break;
    }

    return (baseAmount * feeRate).toFixed(8);
  }

  // Storage Management
  private async saveHDWallet(hdWallet: HDWallet): Promise<void> {
    try {
      // Save encrypted mnemonic to secure store
      await SecureStore.setItemAsync('AURA5O_mnemonic', hdWallet.mnemonic);

      // Save wallet structure (without mnemonic) to async storage
      const walletData = {
        accounts: hdWallet.accounts,
        currentAccountIndex: hdWallet.currentAccountIndex
      };

      await AsyncStorage.setItem('@aura50_hd_wallet', JSON.stringify(walletData));
    } catch (error) {
      throw new Error(`Failed to save HD wallet: ${error}`);
    }
  }

  async loadHDWallet(): Promise<HDWallet | null> {
    // Return in-memory cache immediately — avoids Keystore + crypto on every navigation
    if (this.hdWallet) {
      return this.hdWallet;
    }

    try {
      // Fetch mnemonic (SecureStore) and wallet structure (AsyncStorage) in parallel
      const [mnemonic, walletData] = await Promise.all([
        SecureStore.getItemAsync('AURA5O_mnemonic'),
        AsyncStorage.getItem('@aura50_hd_wallet'),
      ]);

      if (!mnemonic || !walletData) {
        return null;
      }

      const parsedData = JSON.parse(walletData);

      // Reconstruct HD wallet (synchronous crypto — unavoidable, but only runs once per session)
      const seed = bip39Scure.mnemonicToSeedSync(mnemonic);
      const masterKey = HDKey.fromMasterSeed(seed);

      const hdWallet: HDWallet = {
        mnemonic,
        seed,
        masterKey,
        accounts: parsedData.accounts,
        currentAccountIndex: parsedData.currentAccountIndex
      };

      this.hdWallet = hdWallet;
      this.currentAccount = hdWallet.accounts[hdWallet.currentAccountIndex];

      return hdWallet;
    } catch (error) {
      console.error('Failed to load HD wallet:', error);
      return null;
    }
  }

  // Utility Methods
  private async checkAccountActivity(account: HDAccount): Promise<boolean> {
    // In a real implementation, this would check the blockchain
    // For now, return true if balance > 0 or has transactions
    return parseFloat(account.balance) > 0 || account.transactions.length > 0;
  }

  private async addOfflineTransaction(transaction: Transaction): Promise<void> {
    try {
      const offlineTransactions = await AsyncStorage.getItem('@aura50_offline_transactions');
      const transactions = offlineTransactions ? JSON.parse(offlineTransactions) : [];

      transactions.push(transaction);
      await AsyncStorage.setItem('@aura50_offline_transactions', JSON.stringify(transactions));
    } catch (error) {
      console.error('Failed to save offline transaction:', error);
    }
  }

  private calculateFee(amount: string): string {
    const trustLevel = this.user ? this.calculateTrustLevel(this.user) : TrustLevel.NEW;
    return this.calculateTransactionFee(amount, trustLevel);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private async encryptData(data: string, password: string): Promise<string> {
    // Simple encryption - in production, use proper PBKDF2 + AES
    const key = crypto.createHash('sha256').update(password).digest();
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private async decryptData(encryptedData: string, password: string): Promise<string> {
    // Simple decryption - in production, use proper PBKDF2 + AES
    const key = crypto.createHash('sha256').update(password).digest();
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Getters
  getHDWallet(): HDWallet | null {
    return this.hdWallet;
  }

  getCurrentAccount(): HDAccount | null {
    return this.currentAccount;
  }

  getAllAccounts(): HDAccount[] {
    return this.hdWallet?.accounts || [];
  }

  getUser(): User | null {
    return this.user;
  }

  setUser(user: User): void {
    this.user = user;
  }

  // Wallet Status
  isWalletCreated(): boolean {
    return this.hdWallet !== null;
  }

  hasMultipleAccounts(): boolean {
    return this.hdWallet?.accounts.length > 1;
  }
}