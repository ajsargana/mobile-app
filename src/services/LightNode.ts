/**
 * AURA50 Mobile Light Node
 *
 * P2P client for mobile devices
 * - Discovers full nodes via P2P network
 * - Requests services from distributed full nodes
 * - No hardcoded server addresses
 * - Truly decentralized mobile app
 */

import { EventEmitter } from 'events';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LightNodeConfig {
  // Bootstrap nodes for initial network discovery
  bootstrapNodes: string[];

  // Node identity
  nodeId?: string;
  userId?: string;

  // Mobile optimizations
  enableRelay?: boolean; // Use relay for NAT traversal
  maxConnections?: number; // Limit for battery/bandwidth
  enableOfflineQueue?: boolean; // Queue requests when offline

  // Service discovery
  preferredLocation?: string; // Prefer nodes in same country
  minServiceReputation?: number; // Minimum reputation (0-100)
}

export interface ServiceProvider {
  peerId: string;
  address: string;
  services: string[];
  reputation: number;
  responseTime: number;
  location: {
    country: string;
    region: string;
  };
}

interface PendingRequest {
  requestId: string;
  serviceName: string;
  payload: any;
  timestamp: number;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

/**
 * AURA50 Light Node for Mobile
 * Discovers and uses P2P services without centralized backend
 */
export class AURA50LightNode extends EventEmitter {
  private config: LightNodeConfig;
  private isStarted = false;
  private isOnline = false;

  // WebSocket connections to full nodes
  private connections: Map<string, WebSocket> = new Map();
  private activeConnection: WebSocket | null = null;

  // Service discovery cache
  private knownProviders: Map<string, ServiceProvider> = new Map();
  private lastDiscoveryTime: number = 0;
  private readonly DISCOVERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Request tracking
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private offlineQueue: PendingRequest[] = [];

  // Statistics
  private stats = {
    requestsSent: 0,
    requestsSucceeded: 0,
    requestsFailed: 0,
    bytesUploaded: 0,
    bytesDownloaded: 0,
  };

  constructor(config: LightNodeConfig) {
    super();
    this.config = {
      enableRelay: true,
      maxConnections: 5,
      enableOfflineQueue: true,
      minServiceReputation: 50,
      ...config,
    };
  }

  /**
   * Start light node
   * Connects to P2P network via bootstrap nodes
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      console.warn('Light node already started');
      return;
    }

    console.log('🌟 Starting AURA50 Light Node...');
    console.log(`   Bootstrap nodes: ${this.config.bootstrapNodes.length}`);
    console.log(`   User ID: ${this.config.userId || 'anonymous'}`);

    try {
      // Check network connectivity
      await this.checkNetworkConnectivity();

      // Load cached providers
      await this.loadCachedProviders();

      // Connect to bootstrap nodes
      await this.connectToBootstrapNodes();

      // Start network monitoring
      this.startNetworkMonitoring();

      this.isStarted = true;

      console.log('✅ Light node started successfully');
      this.emit('node-started');

    } catch (error) {
      console.error('❌ Failed to start light node:', error);
      throw error;
    }
  }

  /**
   * Stop light node
   * Closes all connections gracefully
   */
  async stop(): Promise<void> {
    if (!this.isStarted) return;

    console.log('🛑 Stopping light node...');

    // Close all WebSocket connections
    for (const [peerId, ws] of this.connections.entries()) {
      ws.close();
    }
    this.connections.clear();
    this.activeConnection = null;

    // Save cached providers
    await this.saveCachedProviders();

    this.isStarted = false;

    console.log('✅ Light node stopped');
    this.emit('node-stopped');
  }

  /**
   * Discover full nodes providing a service
   * Returns list of providers sorted by quality
   */
  async discoverService(
    serviceName: string,
    forceRefresh: boolean = false
  ): Promise<ServiceProvider[]> {
    console.log(`🔍 Discovering ${serviceName} providers...`);

    // Check cache first
    const now = Date.now();
    if (!forceRefresh && (now - this.lastDiscoveryTime < this.DISCOVERY_CACHE_TTL)) {
      const cachedProviders = this.getCachedProviders(serviceName);
      if (cachedProviders.length > 0) {
        console.log(`   ✓ Using ${cachedProviders.length} cached providers`);
        return cachedProviders;
      }
    }

    // Query network for providers
    const providers = await this.queryNetworkForProviders(serviceName);

    // Filter by reputation
    const qualified = providers.filter(
      p => p.reputation >= this.config.minServiceReputation!
    );

    // Sort by quality
    const sorted = this.sortProvidersByQuality(qualified);

    // Update cache
    this.lastDiscoveryTime = now;
    for (const provider of sorted) {
      this.knownProviders.set(provider.peerId, provider);
    }

    console.log(`   ✓ Discovered ${sorted.length} qualified providers`);

    this.emit('providers-discovered', { serviceName, count: sorted.length });

    return sorted;
  }

  /**
   * Request service from P2P network
   * Automatically discovers best provider and sends request
   */
  async requestService(
    serviceName: string,
    payload: any,
    options: {
      timeout?: number;
      preferredProvider?: string;
    } = {}
  ): Promise<any> {
    const timeout = options.timeout || 30000;
    const requestId = this.generateRequestId();

    console.log(`📤 Requesting ${serviceName}...`);

    // Check if online
    if (!this.isOnline) {
      if (this.config.enableOfflineQueue) {
        console.log('   ⚠️ Offline - queueing request');
        return await this.queueOfflineRequest(serviceName, payload, timeout);
      } else {
        throw new Error('Offline - cannot send request');
      }
    }

    // Discover providers
    let providers: ServiceProvider[];

    if (options.preferredProvider) {
      const cached = this.knownProviders.get(options.preferredProvider);
      providers = cached ? [cached] : await this.discoverService(serviceName);
    } else {
      providers = await this.discoverService(serviceName);
    }

    if (providers.length === 0) {
      throw new Error(`No providers found for service: ${serviceName}`);
    }

    // Try providers in order until one succeeds
    let lastError: Error | null = null;

    for (let i = 0; i < Math.min(providers.length, 3); i++) {
      const provider = providers[i];

      try {
        console.log(`   → Trying provider: ${provider.peerId.substring(0, 8)}...`);

        const result = await this.sendServiceRequest(
          provider,
          serviceName,
          requestId,
          payload,
          timeout
        );

        console.log(`   ✅ Service completed`);

        this.stats.requestsSucceeded++;
        this.emit('request-completed', { serviceName, provider: provider.peerId });

        return result;

      } catch (error) {
        console.warn(`   ❌ Provider failed: ${error.message}`);
        lastError = error as Error;

        // Update provider reputation (negative)
        this.updateProviderReputation(provider.peerId, -10);

        // Try next provider
        continue;
      }
    }

    // All providers failed
    this.stats.requestsFailed++;
    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Send service request to specific provider
   */
  private async sendServiceRequest(
    provider: ServiceProvider,
    serviceName: string,
    requestId: string,
    payload: any,
    timeout: number
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeout);

      try {
        // Store pending request
        this.pendingRequests.set(requestId, {
          requestId,
          serviceName,
          payload,
          timestamp: Date.now(),
          resolve: (result) => {
            clearTimeout(timeoutHandle);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeoutHandle);
            reject(error);
          },
        });

        // Get or create connection to provider
        const ws = await this.getConnection(provider);

        // Send request
        const request = {
          type: 'service-request',
          requestId,
          serviceName,
          payload,
          timestamp: Date.now(),
        };

        ws.send(JSON.stringify(request));

        this.stats.requestsSent++;
        this.stats.bytesUploaded += JSON.stringify(request).length;

      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  /**
   * Get or create WebSocket connection to provider
   */
  private async getConnection(provider: ServiceProvider): Promise<WebSocket> {
    // Check if we already have a connection
    const existing = this.connections.get(provider.peerId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return existing;
    }

    // Create new connection
    console.log(`   🔌 Connecting to ${provider.address}...`);

    const ws = new WebSocket(provider.address);

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log(`   ✓ Connected to ${provider.peerId.substring(0, 8)}`);
        this.connections.set(provider.peerId, ws);
        this.setupWebSocketHandlers(ws, provider.peerId);
        resolve(ws);
      };

      ws.onerror = (error) => {
        reject(new Error(`Connection failed: ${error}`));
      };

      // 10 second connection timeout
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(ws: WebSocket, peerId: string): void {
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);

        this.stats.bytesDownloaded += event.data.length;
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    ws.onclose = () => {
      console.log(`   🔌 Disconnected from ${peerId.substring(0, 8)}`);
      this.connections.delete(peerId);

      if (ws === this.activeConnection) {
        this.activeConnection = null;
      }

      this.emit('provider-disconnected', peerId);
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error from ${peerId.substring(0, 8)}:`, error);
    };
  }

  /**
   * Handle incoming message from full node
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'service-response':
        this.handleServiceResponse(message);
        break;

      case 'providers-list':
        this.handleProvidersList(message);
        break;

      case 'peer-info':
        this.handlePeerInfo(message);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Handle service response
   */
  private handleServiceResponse(message: any): void {
    const { requestId, success, result, error } = message;

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`Received response for unknown request: ${requestId}`);
      return;
    }

    this.pendingRequests.delete(requestId);

    if (success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error || 'Service request failed'));
    }
  }

  /**
   * Handle providers list response
   */
  private handleProvidersList(message: any): void {
    const { serviceName, providers } = message;

    console.log(`   ✓ Received ${providers.length} providers for ${serviceName}`);

    // Update cache
    for (const provider of providers) {
      this.knownProviders.set(provider.peerId, provider);
    }
  }

  /**
   * Handle peer info
   */
  private handlePeerInfo(message: any): void {
    const { peerId, info } = message;

    // Update provider info
    const provider = this.knownProviders.get(peerId);
    if (provider) {
      provider.reputation = info.reputation || provider.reputation;
      provider.responseTime = info.responseTime || provider.responseTime;
    }
  }

  /**
   * Query network for service providers
   */
  private async queryNetworkForProviders(serviceName: string): Promise<ServiceProvider[]> {
    // Send query to all connected bootstrap nodes
    const queries: Promise<ServiceProvider[]>[] = [];

    for (const [peerId, ws] of this.connections.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        queries.push(this.queryPeerForProviders(ws, serviceName));
      }
    }

    if (queries.length === 0) {
      throw new Error('No active connections to query');
    }

    // Wait for responses (with timeout)
    const results = await Promise.race([
      Promise.all(queries),
      new Promise<ServiceProvider[][]>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), 10000)
      ),
    ]);

    // Flatten and deduplicate
    const allProviders = results.flat();
    return this.deduplicateProviders(allProviders);
  }

  /**
   * Query specific peer for providers
   */
  private async queryPeerForProviders(
    ws: WebSocket,
    serviceName: string
  ): Promise<ServiceProvider[]> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();

      const query = {
        type: 'query-providers',
        requestId,
        serviceName,
      };

      // Temporary listener for response
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'providers-list' && data.requestId === requestId) {
            ws.removeEventListener('message', handler);
            resolve(data.providers || []);
          }
        } catch (error) {
          // Ignore parse errors
        }
      };

      ws.addEventListener('message', handler);

      ws.send(JSON.stringify(query));

      // Timeout
      setTimeout(() => {
        ws.removeEventListener('message', handler);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * Connect to bootstrap nodes
   */
  private async connectToBootstrapNodes(): Promise<void> {
    console.log('🌐 Connecting to bootstrap nodes...');

    const connectionPromises = this.config.bootstrapNodes.map(async (address) => {
      try {
        const ws = new WebSocket(address);

        return new Promise<WebSocket>((resolve, reject) => {
          ws.onopen = () => {
            console.log(`   ✓ Connected to bootstrap: ${address}`);
            const peerId = `bootstrap_${Math.random().toString(36).substring(7)}`;
            this.connections.set(peerId, ws);
            this.setupWebSocketHandlers(ws, peerId);
            resolve(ws);
          };

          ws.onerror = () => reject(new Error('Connection failed'));

          setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
              ws.close();
              reject(new Error('Connection timeout'));
            }
          }, 10000);
        });
      } catch (error) {
        console.warn(`   ❌ Failed to connect to ${address}`);
        return null;
      }
    });

    const connections = await Promise.allSettled(connectionPromises);

    const successCount = connections.filter(c => c.status === 'fulfilled').length;

    if (successCount === 0) {
      throw new Error('Failed to connect to any bootstrap nodes');
    }

    console.log(`   ✓ Connected to ${successCount}/${this.config.bootstrapNodes.length} bootstrap nodes`);

    // Set first connection as active
    if (this.connections.size > 0) {
      this.activeConnection = Array.from(this.connections.values())[0];
    }
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkConnectivity(): Promise<void> {
    const netInfo = await NetInfo.fetch();

    this.isOnline = netInfo.isConnected === true;

    console.log(`   📶 Network: ${this.isOnline ? 'Online' : 'Offline'}`);
  }

  /**
   * Start network monitoring
   */
  private startNetworkMonitoring(): void {
    NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected === true;

      if (!wasOnline && this.isOnline) {
        console.log('📶 Network reconnected');
        this.emit('network-online');

        // Process offline queue
        this.processOfflineQueue();

        // Reconnect to bootstrap nodes
        this.connectToBootstrapNodes().catch(console.error);
      } else if (wasOnline && !this.isOnline) {
        console.log('📶 Network disconnected');
        this.emit('network-offline');
      }
    });
  }

  /**
   * Queue request for when offline
   */
  private async queueOfflineRequest(
    serviceName: string,
    payload: any,
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();

      this.offlineQueue.push({
        requestId,
        serviceName,
        payload,
        timestamp: Date.now(),
        resolve,
        reject,
      });

      console.log(`   📥 Queued offline request: ${serviceName}`);

      // Reject after timeout
      setTimeout(() => {
        const index = this.offlineQueue.findIndex(r => r.requestId === requestId);
        if (index !== -1) {
          this.offlineQueue.splice(index, 1);
          reject(new Error('Offline request timeout'));
        }
      }, timeout);
    });
  }

  /**
   * Process offline queue when back online
   */
  private async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) return;

    console.log(`📤 Processing ${this.offlineQueue.length} offline requests...`);

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const request of queue) {
      try {
        const result = await this.requestService(request.serviceName, request.payload);
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }
  }

  /**
   * Sort providers by quality
   */
  private sortProvidersByQuality(providers: ServiceProvider[]): ServiceProvider[] {
    return providers.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Reputation (60% weight)
      scoreA += a.reputation * 0.6;
      scoreB += b.reputation * 0.6;

      // Response time (30% weight)
      scoreA += (1000 - Math.min(a.responseTime, 1000)) * 0.03;
      scoreB += (1000 - Math.min(b.responseTime, 1000)) * 0.03;

      // Location preference (10% weight)
      if (this.config.preferredLocation) {
        if (a.location.country === this.config.preferredLocation) scoreA += 10;
        if (b.location.country === this.config.preferredLocation) scoreB += 10;
      }

      return scoreB - scoreA;
    });
  }

  /**
   * Deduplicate providers
   */
  private deduplicateProviders(providers: ServiceProvider[]): ServiceProvider[] {
    const seen = new Set<string>();
    return providers.filter(p => {
      if (seen.has(p.peerId)) return false;
      seen.add(p.peerId);
      return true;
    });
  }

  /**
   * Get cached providers for service
   */
  private getCachedProviders(serviceName: string): ServiceProvider[] {
    const providers: ServiceProvider[] = [];

    for (const provider of this.knownProviders.values()) {
      if (provider.services.includes(serviceName)) {
        providers.push(provider);
      }
    }

    return this.sortProvidersByQuality(providers);
  }

  /**
   * Update provider reputation
   */
  private updateProviderReputation(peerId: string, delta: number): void {
    const provider = this.knownProviders.get(peerId);
    if (provider) {
      provider.reputation = Math.max(0, Math.min(100, provider.reputation + delta));
    }
  }

  /**
   * Load cached providers from storage
   */
  private async loadCachedProviders(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem('aura50_providers_cache');
      if (cached) {
        const providers = JSON.parse(cached);
        for (const provider of providers) {
          this.knownProviders.set(provider.peerId, provider);
        }
        console.log(`   ✓ Loaded ${providers.length} cached providers`);
      }
    } catch (error) {
      console.warn('Failed to load cached providers:', error);
    }
  }

  /**
   * Save cached providers to storage
   */
  private async saveCachedProviders(): Promise<void> {
    try {
      const providers = Array.from(this.knownProviders.values());
      await AsyncStorage.setItem('aura50_providers_cache', JSON.stringify(providers));
    } catch (error) {
      console.warn('Failed to save cached providers:', error);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      isOnline: this.isOnline,
      connectedProviders: this.connections.size,
      knownProviders: this.knownProviders.size,
      offlineQueueSize: this.offlineQueue.length,
    };
  }

  /**
   * Get node info
   */
  getNodeInfo() {
    return {
      nodeId: this.config.nodeId || 'unknown',
      userId: this.config.userId || 'anonymous',
      isStarted: this.isStarted,
      isOnline: this.isOnline,
      connections: this.connections.size,
    };
  }
}

// Singleton instance
export const lightNode = new AURA50LightNode({
  bootstrapNodes: [
    'ws://bootstrap-us.aura50.network:4002',
    'ws://bootstrap-eu.aura50.network:4002',
    'ws://bootstrap-apac.aura50.network:4002',
  ],
  enableRelay: true,
  maxConnections: 5,
  enableOfflineQueue: true,
  minServiceReputation: 50,
});
