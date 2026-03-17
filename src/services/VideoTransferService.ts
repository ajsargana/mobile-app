/**
 * Mobile Video Transfer Service
 *
 * WebRTC P2P video streaming for AURA50 mobile app
 * - Camera access and video capture
 * - P2P connection to backend and pioneers
 * - Encrypted video streaming
 * - Progress tracking
 */

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import axios from 'axios';

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

export class VideoTransferService {
  private apiUrl: string;
  private localStream: MediaStream | null = null;
  private pioneerConnections: Map<string, PioneerConnection> = new Map();
  private sessionId: string | null = null;

  constructor(apiUrl: string = 'http://localhost:5000') {
    this.apiUrl = apiUrl;
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
   * Submit video for verification
   * Initiates P2P transfer to assigned pioneers
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

      console.log('📤 Submitting video for verification...');

      // 1. Submit to backend (creates queue entry)
      const response = await axios.post(`${this.apiUrl}/api/verification/submit-video`, {
        userId,
        challengeId,
        videoSize: this.estimateVideoSize(),
        videoDuration: 30, // Max 30 seconds
      });

      this.sessionId = response.data.videoId;
      const queueStatus = response.data.queueStatus;

      console.log(`✅ Video queued: Position ${queueStatus.queuePosition}`);

      return {
        sessionId: this.sessionId,
        assignedPioneers: [], // Pioneers assigned later by backend
        queuePosition: queueStatus.queuePosition,
      };
    } catch (error) {
      console.error('❌ Failed to submit video:', error);
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

      console.log(`🔗 Connecting to ${pioneerIds.length} pioneers...`);

      for (const pioneerId of pioneerIds) {
        await this.connectToPioneer(sessionId, pioneerId);
      }

      console.log('✅ Connected to all pioneers');
    } catch (error) {
      console.error('❌ Failed to connect to pioneers:', error);
      throw error;
    }
  }

  /**
   * Connect to a single pioneer
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
          await this.sendIceCandidate(sessionId, pioneerId, event.candidate);
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

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await axios.post(`${this.apiUrl}/api/webrtc/create-offer`, {
        sessionId,
        pioneerId,
        offer: peerConnection.localDescription,
      });

      console.log(`✅ Offer sent to pioneer ${pioneerId}`);
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
   * Send ICE candidate to backend
   */
  private async sendIceCandidate(
    sessionId: string,
    pioneerId: string,
    candidate: RTCIceCandidate
  ): Promise<void> {
    try {
      await axios.post(`${this.apiUrl}/api/webrtc/ice-candidate`, {
        sessionId,
        pioneerId,
        candidate: candidate.toJSON(),
      });
    } catch (error) {
      console.error('Failed to send ICE candidate:', error);
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
    console.log('🧹 Cleaning up video transfer service...');

    // Close all peer connections
    this.pioneerConnections.forEach(connection => {
      connection.peerConnection.close();
    });
    this.pioneerConnections.clear();

    // Stop camera
    this.stopCamera();

    console.log('✅ Cleanup complete');
  }
}

// Singleton instance
export const videoTransferService = new VideoTransferService();
