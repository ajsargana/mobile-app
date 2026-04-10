import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import config from '../config/environment';
import { P2PConnection, NetworkStats, Transaction, Block } from '../types';

export class NetworkService {
  private static instance: NetworkService;
  private connections: Map<string, P2PConnection> = new Map();
  private isConnected: boolean = false;
  private networkType: string = 'unknown';
  private syncStatus: 'syncing' | 'synced' | 'offline' = 'offline';
  private messageQueue: any[] = [];
  private readonly baseUrl: string;
  private blockSocket: WebSocket | null = null;
  private lastConnectedMultiaddr: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number = 3000; // ms, doubles on each failure, capped at 30s
  private _stableTimer: ReturnType<typeof setTimeout> | null = null;
  private _networkConnectDebounce: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.baseUrl = config.baseUrl;
    this.initializeNetworkMonitoring();
  }

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  // Network Initialization and Monitoring
  private async initializeNetworkMonitoring(): Promise<void> {
    // Monitor network state changes
    NetInfo.addEventListener(state => {
      this.isConnected = state.isConnected || false;
      this.networkType = state.type || 'unknown';

      if (this.isConnected) {
        // Debounce: rapid NetInfo events (WiFi handoffs, signal fluctuations) must
        // not each spawn a fresh bootstrap connection — only the last event wins.
        if (this._networkConnectDebounce) clearTimeout(this._networkConnectDebounce);
        this._networkConnectDebounce = setTimeout(() => {
          this._networkConnectDebounce = null;
          this.onNetworkConnected();
        }, 2000);
      } else {
        if (this._networkConnectDebounce) {
          clearTimeout(this._networkConnectDebounce);
          this._networkConnectDebounce = null;
        }
        this.onNetworkDisconnected();
      }
    });

    // Initial network state
    const state = await NetInfo.fetch();
    this.isConnected = state.isConnected || false;
    this.networkType = state.type || 'unknown';
  }

  private async onNetworkConnected(): Promise<void> {
    console.log('Network connected:', this.networkType);

    // Process queued messages
    await this.processMessageQueue();

    // Start P2P connections
    await this.connectToBootstrapNodes();

    // Update sync status
    this.syncStatus = 'syncing';
    this.startSync();
  }

  private onNetworkDisconnected(): void {
    console.log('Network disconnected');
    this.syncStatus = 'offline';
    this.clearConnections();
  }

  // P2P Connection Management
  async connectToBootstrapNodes(): Promise<void> {
    // Import environment configuration
    const { BOOTSTRAP_NODES, ENV } = await import('../config/environment');

    const bootstrapNodes = BOOTSTRAP_NODES[ENV === 'production' ? 'production' : 'development'];

    for (const node of bootstrapNodes) {
      try {
        await this.connectToPeer(node);
      } catch (error) {
        console.error(`Failed to connect to bootstrap node ${node}:`, error);
      }
    }
  }

  async connectToPeer(address: string): Promise<boolean> {
    try {
      const peerId = this.generatePeerId(address);

      // Skip if we already have a live socket to this peer
      const existing = this.connections.get(peerId);
      if (existing && existing.status === 'connected' &&
          this.blockSocket && (this.blockSocket.readyState === WebSocket.OPEN ||
                               this.blockSocket.readyState === WebSocket.CONNECTING)) {
        return true;
      }

      const connection: P2PConnection = {
        peerId,
        multiaddr: `/ip4/${address.split(':')[0]}/tcp/${address.split(':')[1]}`,
        status: 'connecting',
        lastSeen: new Date(),
        reputation: 50,
        latency: 0
      };

      // Simulate connection (in real app, use libp2p)
      await this.simulateConnection(connection);

      this.connections.set(peerId, connection);
      console.log(`Connected to peer: ${peerId}`);

      return true;
    } catch (error) {
      console.error(`Failed to connect to peer ${address}:`, error);
      return false;
    }
  }

  /**
   * Shared handler for all block socket messages — used by both the initial
   * connection and any reconnected socket so behaviour stays consistent.
   */
  private handleBlockMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.channel === 'blocks') {
        const type = msg.data?.type;
        // React to: new block opened, block settled (triggers next round),
        // and current_block (cold-start: server sends head on subscribe)
        if (type === 'new_block' || type === 'block_settled' || type === 'current_block') {
          // Backward-compat catch-all
          this.emit('newBlock', msg.data.block);
        }
        // Fine-grained events for delta-driven screens
        if (type === 'block_settled') {
          // A block has been confirmed — mining rewards distributed, tx list updated
          this.emit('blockSettled', msg.data.block);
        } else if (type === 'new_block' || type === 'current_block') {
          // A new block is being built — mining session can start
          this.emit('blockPending', msg.data.block);
        }
      }
    } catch {
      // Ignore malformed frames
    }
  }

  /**
   * (Re-)create the block subscription WebSocket for a previously connected
   * multiaddr. Called by scheduleBlockSocketReconnect() — NOT the initial
   * connection path (that remains in simulateConnection so the P2P Promise
   * can settle correctly).
   */
  private createBlockSocket(multiaddr: string): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Already open — nothing to do
    if (this.blockSocket && (this.blockSocket.readyState === WebSocket.OPEN ||
                              this.blockSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const multiaddrParts = multiaddr.split('/');
    const host = `${multiaddrParts[2]}:${multiaddrParts[4]}`;
    const wsUrl = `ws://${host}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleBlockSocketReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('🔌 Block socket reconnected to', host);
      this.blockSocket = ws;
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'blocks' }));
      // Only reset backoff if connection survives 15 s (prevents rapid-reconnect spam)
      this._stableTimer = setTimeout(() => {
        this._stableTimer = null;
        this.reconnectDelay = 3000;
      }, 15_000);
    };

    ws.onmessage = (event) => this.handleBlockMessage(event);

    ws.onerror = () => {
      // onclose fires right after onerror — handle retry there
    };

    ws.onclose = () => {
      if (this._stableTimer) {
        clearTimeout(this._stableTimer);
        this._stableTimer = null;
        // Connection dropped before stability threshold — do NOT reset delay
      }
      if (this.blockSocket === ws) {
        this.blockSocket = null;
      }
      // Keep retrying as long as the user hasn't explicitly disconnected
      if (this.lastConnectedMultiaddr) {
        this.scheduleBlockSocketReconnect();
      }
    };
  }

  /**
   * Schedule a reconnect attempt with exponential backoff (3 s → 6 s → … → 30 s).
   * Safe to call multiple times — only one timer is ever pending.
   */
  private scheduleBlockSocketReconnect(): void {
    if (!this.lastConnectedMultiaddr) return; // user disconnected — don't retry
    if (this.reconnectTimer) return;           // already scheduled

    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);

    if (delay <= 3000) {
      console.log(`🔄 Block socket dropped — reconnecting in ${delay / 1000}s`);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.lastConnectedMultiaddr) {
        this.createBlockSocket(this.lastConnectedMultiaddr);
      }
    }, delay);
  }

  private async simulateConnection(connection: P2PConnection): Promise<void> {
    return new Promise((resolve) => {
      // Derive the host from the peer ID that was built in connectToPeer()
      const multiaddrParts = connection.multiaddr.split('/'); // /ip4/<ip>/tcp/<port>
      const host = `${multiaddrParts[2]}:${multiaddrParts[4]}`;
      const wsUrl = `ws://${host}/ws`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        // WebSocket constructor failed (e.g. in test env) — fall back
        connection.status = 'connected';
        connection.latency = 100;
        resolve();
        return;
      }

      const startTime = Date.now();
      // Ensure the Promise always resolves exactly once regardless of which
      // WebSocket event fires (iOS can fire onclose without onerror).
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      // Safety timeout: resolve after 5 s if no WS event fires at all
      const timeout = setTimeout(() => {
        connection.status = 'connected';
        connection.latency = 100;
        settle();
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        connection.status = 'connected';
        connection.latency = Date.now() - startTime;
        // Subscribe to block announcements
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'blocks' }));
        this.blockSocket = ws;
        // Remember this address so we can reconnect if the socket drops
        this.lastConnectedMultiaddr = connection.multiaddr;
        this.reconnectDelay = 3000; // initial connection always resets backoff
        // Start stability timer — keeps delay at 3 s only if connection lasts 15 s
        if (this._stableTimer) clearTimeout(this._stableTimer);
        this._stableTimer = setTimeout(() => { this._stableTimer = null; }, 15_000);
        settle();
      };

      ws.onmessage = (event) => this.handleBlockMessage(event);

      ws.onerror = () => {
        clearTimeout(timeout);
        // WebSocket unavailable — fall back to connected with simulated latency
        connection.status = 'connected';
        connection.latency = 100;
        settle();
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (this.blockSocket === ws) {
          this.blockSocket = null;
        }
        // iOS sometimes fires onclose without onerror; resolve if not already done
        if (!settled) {
          connection.status = 'connected';
          connection.latency = 100;
          settle();
        } else {
          // Was a live connection — schedule reconnect
          connection.status = 'disconnected';
          this.scheduleBlockSocketReconnect();
        }
      };
    });
  }

  private clearConnections(): void {
    // Cancel any pending reconnect — user is explicitly disconnecting
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this._stableTimer) {
      clearTimeout(this._stableTimer);
      this._stableTimer = null;
    }
    this.lastConnectedMultiaddr = null; // prevent scheduleBlockSocketReconnect from firing
    this.blockSocket?.close();
    this.blockSocket = null;
    for (const [, connection] of this.connections) {
      connection.status = 'disconnected';
    }
  }

  // Message Broadcasting and Queuing
  async broadcastMessage(message: any): Promise<void> {
    if (!this.isConnected) {
      // Queue message for later
      this.messageQueue.push({
        ...message,
        timestamp: new Date(),
        retries: 0
      });
      await this.saveMessageQueue();
      return;
    }

    // Broadcast to connected peers
    const connectedPeers = Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected');

    for (const peer of connectedPeers) {
      try {
        await this.sendMessageToPeer(peer.peerId, message);
      } catch (error) {
        console.error(`Failed to send message to peer ${peer.peerId}:`, error);
      }
    }
  }

  private async sendMessageToPeer(peerId: string, message: any): Promise<void> {
    // Simulate message sending (in real app, use libp2p)
    console.log(`Sending message to ${peerId}:`, message.type);

    // Update peer's last seen
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.lastSeen = new Date();
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) {
      return;
    }

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of messages) {
      try {
        await this.broadcastMessage(message);
      } catch (error) {
        // Re-queue failed messages with retry limit
        if (message.retries < 3) {
          message.retries++;
          this.messageQueue.push(message);
        }
      }
    }

    await this.saveMessageQueue();
  }

  // Mobile-Optimized Sync
  private async startSync(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      // Request latest block height from peers
      const networkStats = await this.requestNetworkStats();

      // Determine if we need to sync
      const localHeight = await this.getLocalBlockHeight();
      const networkHeight = networkStats.blockHeight;

      if (localHeight < networkHeight) {
        await this.syncBlocks(localHeight, networkHeight);
      }

      this.syncStatus = 'synced';
    } catch (error) {
      console.error('Sync failed:', error);
      this.syncStatus = 'offline';
    }
  }

  private async syncBlocks(fromHeight: number, toHeight: number): Promise<void> {
    // Mobile-optimized sync: only sync headers + merkle proofs
    const batchSize = this.getBatchSize();

    for (let height = fromHeight; height <= toHeight; height += batchSize) {
      const endHeight = Math.min(height + batchSize - 1, toHeight);

      try {
        const blocks = await this.requestBlocks(height, endHeight);
        await this.processReceivedBlocks(blocks);
      } catch (error) {
        console.error(`Failed to sync blocks ${height}-${endHeight}:`, error);
        break;
      }
    }
  }

  private getBatchSize(): number {
    // Adjust batch size based on network type
    switch (this.networkType) {
      case '2G':
        return 1; // Very small batches for 2G
      case '3G':
        return 5;
      case 'wifi':
      case '4G':
      case '5G':
        return 20;
      default:
        return 10;
    }
  }

  // Data Compression for Mobile
  private compressMessage(message: any): any {
    // Remove unnecessary fields for mobile
    const compressed = {
      t: message.type,
      d: message.data,
      ts: message.timestamp
    };

    // Additional compression based on message type
    if (message.type === 'block') {
      // Only send block header for mobile
      compressed.d = {
        h: message.data.height,
        hash: message.data.hash,
        prev: message.data.prevHash,
        mr: message.data.merkleRoot,
        ts: message.data.timestamp
      };
    }

    return compressed;
  }

  // Mining Integration - Submit share to decentralized block
  async submitMiningShare(share: {
    blockId: string;
    nonce: number;
    hash: string;
    difficulty: number;
    hashesComputed?: number;
    timeElapsed?: number;
    /** Staking share-weight multiplier, e.g. 1.20 for a 20% boost. Defaults to 1.0 (no stake). */
    stakingBoost?: number;
  }): Promise<{
    accepted: boolean;
    reason?: string;
    message?: string;
    blockHeight?: number;
    acceptedShares?: number;
    /** Staking boost the server actually applied to this share (e.g. 1.20). Present only on acceptance. */
    appliedBoost?: number;
  }> {
    try {
      const authToken = await this.getAuthToken();
      const url = `${this.baseUrl}/api/blocks/submit-share`;

      console.log('🔄 Submitting mining share:', {
        url,
        hasToken: !!authToken,
        share: { ...share, hash: share.hash.substring(0, 16) + '...' }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(share)
      });

      console.log('📡 Mining share response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });

      if (!response.ok) {
        // If 401 Unauthorized: clear stale token, re-auth, retry once
        if (response.status === 401) {
          console.log('🔓 Auth token invalid/expired — re-authenticating...');
          await AsyncStorage.removeItem('@aura50_auth_token');
          const freshToken = await this.reAuthWithStoredCredentials();
          if (freshToken) {
            console.log('🔄 Retrying share submission with fresh token...');
            const retry = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
              body: JSON.stringify(share),
            });
            if (retry.ok) {
              const result = await retry.json();
              console.log('✅ Mining share accepted (after re-auth):', result);
              return result;
            }
            console.warn('⚠️ Share retry after re-auth also failed:', retry.status);
          }
        }

        // Try to parse error as JSON
        const contentType = response.headers.get('content-type');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        if (contentType?.includes('application/json')) {
          try {
            const error = await response.json();
            errorMessage = error.message || errorMessage;
            console.error('❌ Mining share rejected (JSON):', error);
          } catch (e) {
            console.error('❌ Failed to parse error JSON');
          }
        } else {
          // Got HTML or other non-JSON response
          const text = await response.text();
          console.error('❌ Mining share rejected (non-JSON):', {
            status: response.status,
            contentType,
            bodyPreview: text.substring(0, 200)
          });
        }

        return {
          accepted: false,
          reason: errorMessage
        };
      }

      const result = await response.json();
      console.log('✅ Mining share accepted:', result);
      return result;
    } catch (error) {
      console.error('Failed to submit mining share:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n')[0]
      });
      return {
        accepted: false,
        reason: `Network error: ${(error as Error).message}`
      };
    }
  }

  // Legacy P2P broadcast (for compatibility)
  async submitMiningProof(proof: any): Promise<boolean> {
    try {
      const message = {
        type: 'mining_proof',
        data: proof,
        timestamp: new Date()
      };

      await this.broadcastMessage(message);
      return true;
    } catch (error) {
      console.error('Failed to submit mining proof:', error);
      return false;
    }
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('@aura50_auth_token');
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  }

  /** Re-authenticate using stored credentials (set during wallet setup). */
  private async reAuthWithStoredCredentials(): Promise<string | null> {
    try {
      const email    = await AsyncStorage.getItem('@aura50_auth_email');
      const password = await AsyncStorage.getItem('@aura50_auth_pass');
      if (!email || !password) {
        console.warn('⚠️ reAuth: no stored credentials found');
        return null;
      }
      const res = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        const token = data.token;
        if (token) {
          await AsyncStorage.setItem('@aura50_auth_token', token);
          console.log('✅ Re-authenticated successfully');
          return token;
        }
      } else {
        const err = await res.json().catch(() => ({})) as any;
        console.warn(`⚠️ reAuth login failed: HTTP ${res.status} — ${err?.message || ''}`);
      }
    } catch (e) {
      console.warn('⚠️ reAuth exception:', e);
    }
    return null;
  }

  // Transaction Broadcasting
  async submitTransaction(transaction: Transaction): Promise<boolean> {
    try {
      const message = {
        type: 'transaction',
        data: transaction,
        timestamp: new Date()
      };

      await this.broadcastMessage(message);
      return true;
    } catch (error) {
      console.error('Failed to submit transaction:', error);
      return false;
    }
  }

  // Network Statistics
  async getNetworkStats(): Promise<NetworkStats> {
    try {
      // In real implementation, this would query connected peers
      return {
        connectedPeers: this.getConnectedPeerCount(),
        totalPeers: this.connections.size,
        blockHeight: await this.getLocalBlockHeight(),
        hashRate: 0, // Would be calculated from network
        difficulty: 1000,
        networkVersion: '1.0.0',
        syncStatus: this.syncStatus
      };
    } catch (error) {
      console.error('Failed to get network stats:', error);
      return {
        connectedPeers: 0,
        totalPeers: 0,
        blockHeight: 0,
        hashRate: 0,
        difficulty: 1000,
        networkVersion: '1.0.0',
        syncStatus: 'offline'
      };
    }
  }

  private getConnectedPeerCount(): number {
    return Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected').length;
  }

  // Data Persistence
  private async saveMessageQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem('@aura50_message_queue', JSON.stringify(this.messageQueue));
    } catch (error) {
      console.error('Failed to save message queue:', error);
    }
  }

  private async loadMessageQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem('@aura50_message_queue');
      this.messageQueue = data ? JSON.parse(data) : [];
    } catch (error) {
      this.messageQueue = [];
    }
  }

  // Utility Methods
  private generatePeerId(address: string): string {
    return `peer_${address.replace(/[:.]/g, '_')}_${Date.now()}`;
  }

  private async getLocalBlockHeight(): Promise<number> {
    try {
      const height = await AsyncStorage.getItem('@aura50_block_height');
      return height ? parseInt(height) : 0;
    } catch (error) {
      return 0;
    }
  }

  private async requestNetworkStats(): Promise<NetworkStats> {
    // Simulate network request
    return {
      connectedPeers: this.getConnectedPeerCount(),
      totalPeers: 100,
      blockHeight: 1000,
      hashRate: 1000000,
      difficulty: 1000,
      networkVersion: '1.0.0',
      syncStatus: 'synced'
    };
  }

  private async requestBlocks(startHeight: number, endHeight: number): Promise<Block[]> {
    // Simulate block request
    const blocks: Block[] = [];

    for (let height = startHeight; height <= endHeight; height++) {
      blocks.push({
        id: `block_${height}`,
        height,
        hash: `hash_${height}`,
        prevHash: height > 0 ? `hash_${height - 1}` : null,
        merkleRoot: `merkle_${height}`,
        timestamp: new Date(Date.now() - (1000 - height) * 600000), // 10 min blocks
        nonce: Math.random().toString(),
        difficulty: 1000,
        transactions: [],
        participants: [],
        status: 'confirmed'
      });
    }

    return blocks;
  }

  private async processReceivedBlocks(blocks: Block[]): Promise<void> {
    for (const block of blocks) {
      await this.saveBlock(block);
    }

    // Update local block height
    const maxHeight = Math.max(...blocks.map(b => b.height));
    await AsyncStorage.setItem('@aura50_block_height', maxHeight.toString());
  }

  private async saveBlock(block: Block): Promise<void> {
    try {
      await AsyncStorage.setItem(`@aura50_block_${block.height}`, JSON.stringify(block));
    } catch (error) {
      console.error(`Failed to save block ${block.height}:`, error);
    }
  }

  // Public Getters
  isNetworkConnected(): boolean {
    return this.isConnected;
  }

  getNetworkType(): string {
    return this.networkType;
  }

  getSyncStatus(): 'syncing' | 'synced' | 'offline' {
    return this.syncStatus;
  }

  getConnections(): P2PConnection[] {
    return Array.from(this.connections.values());
  }

  // Block Validation API - Download blocks for validation
  async downloadBlocksForValidation(startHeight: number, count: number): Promise<Block[]> {
    try {
      const authToken = await this.getAuthToken();
      const url = `${this.baseUrl}/api/blocks/range?start=${startHeight}&count=${count}`;

      console.log(`📥 Downloading ${count} blocks starting from ${startHeight}...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download blocks: ${response.status} ${response.statusText}`);
      }

      const blocks = await response.json();
      console.log(`✅ Downloaded ${blocks.length} blocks`);

      return blocks;
    } catch (error) {
      console.error('Error downloading blocks:', error);
      // Fall back to simulated blocks for development
      return this.requestBlocks(startHeight, startHeight + count - 1);
    }
  }

  async getCurrentBlockchainHeight(): Promise<number> {
    try {
      const authToken = await this.getAuthToken();
      const url = `${this.baseUrl}/api/blocks/current-height`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get current height: ${response.status}`);
      }

      const data = await response.json();
      return data.height || 0;
    } catch (error) {
      console.error('Error getting blockchain height:', error);
      // Fall back to network stats for development
      const stats = await this.requestNetworkStats();
      return stats.blockHeight;
    }
  }

  async downloadBlock(height: number): Promise<Block | null> {
    try {
      const authToken = await this.getAuthToken();
      const url = `${this.baseUrl}/api/blocks/${height}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Block not found
        }
        throw new Error(`Failed to download block: ${response.status}`);
      }

      const block = await response.json();
      return block;
    } catch (error) {
      console.error(`Error downloading block ${height}:`, error);
      return null;
    }
  }

  // Get network info for validation
  async getNetworkInfo(): Promise<{
    isConnected: boolean;
    type: string;
    isWiFi: boolean;
  }> {
    return {
      isConnected: this.isConnected,
      type: this.networkType,
      isWiFi: this.networkType === 'wifi'
    };
  }

  // Event system for validation
  private eventHandlers: Map<string, Function[]> = new Map();

  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  // P2P Network Management
  async startP2PNetwork(): Promise<void> {
    console.log('🌐 Starting P2P network...');
    await this.connectToBootstrapNodes();
    this.syncStatus = 'syncing';
    await this.startSync();
  }

  async stopP2PNetwork(): Promise<void> {
    console.log('🛑 Stopping P2P network...');
    this.clearConnections();
    this.syncStatus = 'offline';
  }

  async broadcastTransaction(transaction: Transaction): Promise<void> {
    await this.submitTransaction(transaction);
  }

  async getConnectedPeers(): Promise<P2PConnection[]> {
    return Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected');
  }
}