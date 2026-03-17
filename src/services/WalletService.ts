import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateKeyPair, sign, verify } from 'react-native-crypto';
import { MobileWallet, Transaction, User, TrustLevel } from '../types';

export class WalletService {
  private static instance: WalletService;
  private wallet: MobileWallet | null = null;
  private user: User | null = null;

  private constructor() {}

  static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  // Wallet Creation and Management
  async createWallet(): Promise<MobileWallet> {
    try {
      const keyPair = await generateKeyPair('secp256k1');
      const address = this.deriveAddress(keyPair.publicKey);

      const wallet: MobileWallet = {
        address,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        balance: '0',
        transactions: [],
        offlineTransactions: []
      };

      await this.saveWallet(wallet);
      this.wallet = wallet;
      return wallet;
    } catch (error) {
      throw new Error(`Failed to create wallet: ${error}`);
    }
  }

  async loadWallet(): Promise<MobileWallet | null> {
    try {
      const walletData = await AsyncStorage.getItem('@aura50_wallet');
      if (walletData) {
        this.wallet = JSON.parse(walletData);
        return this.wallet;
      }
      return null;
    } catch (error) {
      console.error('Failed to load wallet:', error);
      return null;
    }
  }

  async saveWallet(wallet: MobileWallet): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_wallet', JSON.stringify(wallet));
    } catch (error) {
      throw new Error(`Failed to save wallet: ${error}`);
    }
  }

  // Transaction Management
  async createTransaction(
    to: string,
    amount: string,
    isOffline: boolean = false
  ): Promise<Transaction> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const fee = this.calculateFee(amount);
    const transaction: Transaction = {
      id: this.generateId(),
      from: this.wallet.address,
      to,
      amount,
      fee,
      timestamp: new Date(),
      status: isOffline ? 'offline' : 'pending',
      signature: ''
    };

    // Sign transaction
    transaction.signature = await this.signTransaction(transaction);

    if (isOffline) {
      this.wallet.offlineTransactions.push(transaction);
    } else {
      this.wallet.transactions.push(transaction);
    }

    await this.saveWallet(this.wallet);
    return transaction;
  }

  async signTransaction(transaction: Transaction): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const txData = JSON.stringify({
      from: transaction.from,
      to: transaction.to,
      amount: transaction.amount,
      fee: transaction.fee,
      timestamp: transaction.timestamp.toISOString()
    });

    return await sign(txData, this.wallet.privateKey);
  }

  async broadcastOfflineTransactions(): Promise<void> {
    if (!this.wallet || this.wallet.offlineTransactions.length === 0) {
      return;
    }

    // Move offline transactions to pending
    for (const tx of this.wallet.offlineTransactions) {
      tx.status = 'pending';
      this.wallet.transactions.push(tx);
    }

    this.wallet.offlineTransactions = [];
    await this.saveWallet(this.wallet);
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

  // Balance Management
  async updateBalance(newBalance: string): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    this.wallet.balance = newBalance;
    await this.saveWallet(this.wallet);
  }

  getBalance(): string {
    return this.wallet?.balance || '0';
  }

  // QR Code Generation
  generatePaymentQR(amount?: string): string {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const qrData = {
      type: 'payment',
      address: this.wallet.address,
      amount: amount || '0',
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(qrData);
  }

  // Backup and Recovery
  async createBackup(password: string): Promise<string> {
    if (!this.wallet || !this.user) {
      throw new Error('Wallet or user not initialized');
    }

    const backupData = {
      wallet: this.wallet,
      user: this.user,
      timestamp: new Date().toISOString()
    };

    // Encrypt backup data (simplified)
    const encrypted = await this.encrypt(JSON.stringify(backupData), password);
    return encrypted;
  }

  async restoreFromBackup(backupData: string, password: string): Promise<void> {
    try {
      const decrypted = await this.decrypt(backupData, password);
      const data = JSON.parse(decrypted);

      this.wallet = data.wallet;
      this.user = data.user;

      await this.saveWallet(this.wallet);
      await this.saveUser(this.user);
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error}`);
    }
  }

  // Mining Integration
  async startMining(): Promise<boolean> {
    if (!this.wallet || !this.user) {
      return false;
    }

    try {
      // Create mining participation proof
      const proofData = {
        address: this.wallet.address,
        timestamp: new Date().toISOString(),
        nonce: Math.random().toString(36)
      };

      const proof = await sign(JSON.stringify(proofData), this.wallet.privateKey);

      // In a real implementation, this would be sent to the network
      console.log('Mining proof created:', proof);
      return true;
    } catch (error) {
      console.error('Mining start failed:', error);
      return false;
    }
  }

  // Utility Methods
  private deriveAddress(publicKey: string): string {
    // Simplified address derivation
    return `AURA5O${publicKey.slice(-20)}`;
  }

  private calculateFee(amount: string): string {
    const trustLevel = this.user ? this.calculateTrustLevel(this.user) : TrustLevel.NEW;
    return this.calculateTransactionFee(amount, trustLevel);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private async encrypt(data: string, password: string): Promise<string> {
    // Simplified encryption - in production use proper crypto
    return Buffer.from(data).toString('base64');
  }

  private async decrypt(encryptedData: string, password: string): Promise<string> {
    // Simplified decryption - in production use proper crypto
    return Buffer.from(encryptedData, 'base64').toString();
  }

  private async saveUser(user: User): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_user', JSON.stringify(user));
    } catch (error) {
      throw new Error(`Failed to save user: ${error}`);
    }
  }

  // Getters
  getWallet(): MobileWallet | null {
    return this.wallet;
  }

  getUser(): User | null {
    return this.user;
  }

  setUser(user: User): void {
    this.user = user;
  }
}