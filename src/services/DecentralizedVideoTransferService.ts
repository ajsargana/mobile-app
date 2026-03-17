/**
 * Decentralized Video Transfer Service
 *
 * P2P video streaming using distributed full nodes
 * - No hardcoded backend URLs
 * - Discovers full nodes via P2P network
 * - Requests services from any available node
 * - Truly decentralized architecture
 */

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import { lightNode } from './LightNode';

interface VideoConfig {
  facingMode: 'user' | 'environment';
  width: number;
  height: number;
}

interface PioneerConnection {
  pioneerId: string;
  peerConnection: RTCPeerConnection;
  status: 'connecting' | 'connected' | 'failed';
  transferProgress: number;
}

/**
 * Decentralized Video Transfer Service
 * Uses P2P service discovery instead of centralized API
 */
export class DecentralizedVideoTransferService {
  private localStream: MediaStream | null = null;
  private pioneerConnections: Map<string, PioneerConnection> = new Map();
  private sessionId: string | null = null;

  constructor() {
    // No apiUrl parameter - we discover services via P2P!
  }

  /**
   * Start camera and capture video
   */
  async startCamera(config: Partial<VideoConfig> = {}): Promise<MediaStream> {
    try {
      const defaultConfig: VideoConfig = {
        facingMode: 'user',
        width: 1280,
        height: 720,
        ...config,
      };

      console.log('📹 Starting camera...');

      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: defaultConfig.facingMode,
          width: { ideal: defaultConfig.width },
          height: { ideal: defaultConfig.height },
        },
        audio: true,
      });

      this.localStream = stream;
      console.log('✅ Camera started successfully');

      return stream;
    } catch (error) {
      console.error('❌ Failed to access camera:', error);
      throw new Error('Camera access denied. Please enable camera permissions.');
    }
  }

  /**
   * Stop camera and release resources
   */
  stopCamera(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      console.log('🛑 Camera stopped');
    }
  }

  /**
   * Submit video for verification (P2P version)
   * Discovers and uses any available full node
   */
  async submitForVerification(
    userId: string,
    challengeId: string
  ): Promise<{
    sessionId: string;
    assignedPioneers: string[];
    queuePosition: number;
  }> {
    try {
      if (!this.localStream) {
        throw new Error('Camera not started. Call startCamera() first.');
      }

      console.log('📤 Submitting video for verification via P2P...');

      // Discover full nodes providing WebRTC signaling service
      console.log('🔍 Discovering WebRTC signaling providers...');
      const providers = await lightNode.discoverService('webrtc-signaling');

      if (providers.length === 0) {
        throw new Error('No WebRTC signaling providers available');
      }

      console.log(`   ✓ Found ${providers.length} providers`);

      // Request WebRTC signaling service from best provider
      console.log('📤 Requesting pioneer assignment...');
      const result = await lightNode.requestService('webrtc-signaling', {
        userId,
        challengeId,
        videoSize: this.estimateVideoSize(),
        videoDuration: 30,
      });

      this.sessionId = result.sessionId;

      console.log(`✅ Video queued via P2P: Session ${result.sessionId}`);

      return {
        sessionId: result.sessionId,
        assignedPioneers: result.assignedPioneers || [],
        queuePosition: result.queuePosition || 0,
      };
    } catch (error) {
      console.error('❌ Failed to submit video via P2P:', error);
      throw error;
    }
  }

  /**
   * Connect to assigned pioneers via P2P
   * Called when pioneers are assigned
   */
  async connectToPioneers(
    sessionId: string,
    pioneerIds: string[]
  ): Promise<void> {
    try {
      if (!this.localStream) {
        throw new Error('No active video stream');
      }

      console.log(`🔗 Connecting to ${pioneerIds.length} pioneers via P2P...`);

      for (const pioneerId of pioneerIds) {
        await this.connectToPioneer(sessionId, pioneerId);
      }

      console.log('✅ Connected to all pioneers via P2P');
    } catch (error) {
      console.error('❌ Failed to connect to pioneers:', error);
      throw error;
    }
  }

  /**
   * Connect to a single pioneer (P2P version)
   */
  private async connectToPioneer(
    sessionId: string,
    pioneerId: string
  ): Promise<void> {
    try {
      // Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      // Add local stream
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, this.localStream!);
        });
      }

      // Store connection
      this.pioneerConnections.set(pioneerId, {
        pioneerId,
        peerConnection,
        status: 'connecting',
        transferProgress: 0,
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          await this.sendIceCandidateP2P(sessionId, pioneerId, event.candidate);
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const connection = this.pioneerConnections.get(pioneerId);
        if (connection) {
          console.log(`Pioneer ${pioneerId}: ${peerConnection.connectionState}`);

          if (peerConnection.connectionState === 'connected') {
            connection.status = 'connected';
          } else if (peerConnection.connectionState === 'failed') {
            connection.status = 'failed';
          }
        }
      };

      // Create and send offer via P2P
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Send offer via P2P network (no HTTP!)
      console.log('📤 Sending WebRTC offer via P2P...');
      await lightNode.requestService('webrtc-signaling', {
        action: 'create-offer',
        sessionId,
        pioneerId,
        offer: peerConnection.localDescription,
      });

      console.log(`✅ Offer sent to pioneer ${pioneerId} via P2P`);
    } catch (error) {
      console.error(`❌ Failed to connect to pioneer ${pioneerId}:`, error);
      throw error;
    }
  }

  /**
   * Handle answer from pioneer
   */
  async handlePioneerAnswer(
    pioneerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const connection = this.pioneerConnections.get(pioneerId);
    if (!connection) {
      console.warn(`No connection found for pioneer ${pioneerId}`);
      return;
    }

    try {
      await connection.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      console.log(`✅ Received answer from pioneer ${pioneerId}`);
    } catch (error) {
      console.error(`❌ Failed to handle answer from ${pioneerId}:`, error);
    }
  }

  /**
   * Handle ICE candidate from pioneer
   */
  async handleIceCandidate(
    pioneerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const connection = this.pioneerConnections.get(pioneerId);
    if (!connection) return;

    try {
      await connection.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error(`❌ Failed to add ICE candidate:`, error);
    }
  }

  /**
   * Send ICE candidate via P2P (no HTTP!)
   */
  private async sendIceCandidateP2P(
    sessionId: string,
    pioneerId: string,
    candidate: RTCIceCandidate
  ): Promise<void> {
    try {
      await lightNode.requestService('webrtc-signaling', {
        action: 'ice-candidate',
        sessionId,
        pioneerId,
        candidate: candidate.toJSON(),
      });
    } catch (error) {
      console.error('Failed to send ICE candidate via P2P:', error);
    }
  }

  /**
   * Get transfer progress for all pioneers
   */
  getTransferProgress(): Map<string, number> {
    const progress = new Map<string, number>();

    this.pioneerConnections.forEach((connection, pioneerId) => {
      progress.set(pioneerId, connection.transferProgress);
    });

    return progress;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): Map<string, string> {
    const status = new Map<string, string>();

    this.pioneerConnections.forEach((connection, pioneerId) => {
      status.set(pioneerId, connection.status);
    });

    return status;
  }

  /**
   * Estimate video size (rough calculation)
   */
  private estimateVideoSize(): number {
    // Rough estimate: 1280x720 @ 30fps for 30 seconds
    // H.264 encoding ~2-4 Mbps
    const durationSeconds = 30;
    const bitrateMbps = 3;
    const sizeBytes = (bitrateMbps * durationSeconds * 1024 * 1024) / 8;
    return Math.round(sizeBytes);
  }

  /**
   * Cleanup all connections
   */
  cleanup(): void {
    console.log('🧹 Cleaning up decentralized video transfer service...');

    // Close all peer connections
    this.pioneerConnections.forEach(connection => {
      connection.peerConnection.close();
    });
    this.pioneerConnections.clear();

    // Stop camera
    this.stopCamera();

    console.log('✅ Cleanup complete');
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      ...lightNode.getStatistics(),
      activeConnections: this.pioneerConnections.size,
      activeStreams: this.localStream ? 1 : 0,
    };
  }
}

// Singleton instance
export const decentralizedVideoTransferService = new DecentralizedVideoTransferService();
