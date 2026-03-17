/**
 * Decentralized Video Verification Example
 *
 * Complete example showing how to use P2P services
 * - No hardcoded backend URLs
 * - Discovers services via P2P network
 * - Truly decentralized mobile app
 */

import React, { useState, useEffect } from 'react';
import { View, Button, Text, StyleSheet, Alert } from 'react-native';
import { lightNode } from '../services/LightNode';
import { decentralizedVideoTransferService } from '../services/DecentralizedVideoTransferService';
import { locationService } from '../services/LocationService';
import { videoEncryptionService } from '../services/VideoEncryptionService';

export const DecentralizedVerificationExample: React.FC = () => {
  const [isNodeStarted, setIsNodeStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<any>(null);

  useEffect(() => {
    // Start light node when component mounts
    startLightNode();

    // Update statistics periodically
    const interval = setInterval(() => {
      const stats = decentralizedVideoTransferService.getStatistics();
      setStatistics(stats);
    }, 2000);

    return () => {
      clearInterval(interval);
      lightNode.stop();
    };
  }, []);

  /**
   * Start P2P light node
   */
  const startLightNode = async () => {
    try {
      console.log('🌟 Starting P2P light node...');

      await lightNode.start();

      setIsNodeStarted(true);

      console.log('✅ P2P light node started!');

      Alert.alert(
        'Connected to P2P Network',
        'Your app is now connected to the decentralized AURA50 network. No central servers!'
      );
    } catch (error) {
      console.error('Failed to start light node:', error);
      Alert.alert('Connection Error', 'Failed to connect to P2P network. Please check your internet connection.');
    }
  };

  /**
   * Complete decentralized verification flow
   */
  const handleStartVerification = async () => {
    if (!isNodeStarted) {
      Alert.alert('Not Ready', 'P2P network connection not established. Please wait...');
      return;
    }

    setIsRecording(true);

    try {
      console.log('');
      console.log('🚀 STARTING DECENTRALIZED VERIFICATION FLOW');
      console.log('============================================');
      console.log('');

      // Step 1: Start camera
      console.log('📹 Step 1: Starting camera...');
      const stream = await decentralizedVideoTransferService.startCamera({
        facingMode: 'user',
        width: 1280,
        height: 720,
      });
      console.log('   ✅ Camera started');
      console.log('');

      // Step 2: Get location (for geographic diversity)
      console.log('📍 Step 2: Getting location...');
      const location = await locationService.getCurrentLocation();
      console.log(`   ✅ Location: ${locationService.formatLocation(location)}`);
      console.log('');

      // Step 3: Record video (simulated - 30 seconds)
      console.log('🎥 Step 3: Recording video (30 seconds)...');
      Alert.alert('Recording', 'Please record your verification video (30 seconds)');

      // Simulate recording delay
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds for demo

      // In production: capture actual video buffer
      const videoBuffer = new ArrayBuffer(1024 * 1024); // Placeholder
      console.log('   ✅ Video recorded');
      console.log('');

      // Step 4: Encrypt video
      console.log('🔐 Step 4: Encrypting video...');
      const userId = 'user_123'; // Get from app state
      const tempSessionId = `session_${Date.now()}`;

      const encrypted = await videoEncryptionService.encryptVideo(
        videoBuffer,
        userId,
        tempSessionId
      );
      console.log('   ✅ Video encrypted with AES-256');
      console.log('');

      // Step 5: Submit via P2P (no HTTP!)
      console.log('📤 Step 5: Submitting to P2P network...');
      console.log('   🔍 Discovering WebRTC signaling providers...');

      const submission = await decentralizedVideoTransferService.submitForVerification(
        userId,
        'challenge_123'
      );

      setSessionId(submission.sessionId);

      console.log(`   ✅ Video submitted via P2P!`);
      console.log(`   Session ID: ${submission.sessionId}`);
      console.log(`   Queue Position: ${submission.queuePosition}`);
      console.log('');

      // Step 6: Wait for pioneer assignment
      console.log('⏳ Step 6: Waiting for pioneer assignment...');
      console.log('   (Backend is selecting 3 geographically diverse pioneers)');

      // In production: backend will notify via P2P when pioneers assigned
      // Simulate pioneer assignment for demo
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockPioneers = ['pioneer_1', 'pioneer_2', 'pioneer_3'];
      console.log(`   ✅ Assigned pioneers: ${mockPioneers.join(', ')}`);
      console.log('');

      // Step 7: Connect to pioneers via P2P
      console.log('🔗 Step 7: Connecting to pioneers via P2P...');
      await decentralizedVideoTransferService.connectToPioneers(
        submission.sessionId,
        mockPioneers
      );
      console.log('   ✅ Connected to all 3 pioneers');
      console.log('');

      // Step 8: Share encryption keys with pioneers
      console.log('🔑 Step 8: Sharing encryption keys...');
      for (const pioneerId of mockPioneers) {
        const keyPackage = await videoEncryptionService.shareKeyWithPioneer(
          tempSessionId,
          pioneerId
        );
        console.log(`   ✅ Key shared with ${pioneerId}`);
      }
      console.log('');

      console.log('============================================');
      console.log('🎉 VERIFICATION SUBMITTED SUCCESSFULLY!');
      console.log('============================================');
      console.log('');
      console.log('✅ Video uploaded via P2P (no central server)');
      console.log('✅ Encrypted end-to-end');
      console.log('✅ Assigned to 3 geographically diverse pioneers');
      console.log('✅ Awaiting pioneer review (24-48 hours)');
      console.log('');

      Alert.alert(
        'Success!',
        `Video submitted via P2P network!\n\nSession ID: ${submission.sessionId}\n\nYour video has been sent to 3 pioneers for review. No central servers involved!`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('');
      console.error('❌ VERIFICATION FAILED:', error);
      console.error('');

      Alert.alert(
        'Error',
        `Failed to submit verification: ${error.message}\n\nPlease check your P2P network connection.`
      );
    } finally {
      setIsRecording(false);
    }
  };

  /**
   * Discover available services
   */
  const handleDiscoverServices = async () => {
    try {
      console.log('');
      console.log('🔍 DISCOVERING AVAILABLE SERVICES');
      console.log('==================================');
      console.log('');

      const services = [
        'webrtc-signaling',
        'pioneer-selection',
        'video-watermarking',
        'deepfake-detection',
      ];

      for (const serviceName of services) {
        console.log(`Discovering: ${serviceName}...`);
        const providers = await lightNode.discoverService(serviceName);
        console.log(`   ✓ Found ${providers.length} providers`);

        if (providers.length > 0) {
          console.log(`   Top provider: ${providers[0].peerId.substring(0, 16)}...`);
          console.log(`   Reputation: ${providers[0].reputation}/100`);
          console.log(`   Response time: ${providers[0].responseTime}ms`);
          console.log(`   Location: ${providers[0].location.country}`);
        }

        console.log('');
      }

      Alert.alert(
        'Service Discovery Complete',
        `Discovered services from ${services.length} full nodes across the network!`
      );
    } catch (error) {
      console.error('Service discovery failed:', error);
      Alert.alert('Discovery Failed', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🌐 Decentralized Verification</Text>
      <Text style={styles.subtitle}>No Central Servers - Pure P2P</Text>

      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>P2P Network:</Text>
        <Text style={[styles.statusValue, isNodeStarted && styles.statusConnected]}>
          {isNodeStarted ? '✅ Connected' : '⏳ Connecting...'}
        </Text>
      </View>

      {isNodeStarted && statistics && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Network Statistics</Text>
          <Text style={styles.statLine}>
            Providers: {statistics.knownProviders}
          </Text>
          <Text style={styles.statLine}>
            Connections: {statistics.connectedProviders}
          </Text>
          <Text style={styles.statLine}>
            Requests: {statistics.requestsSent} sent, {statistics.requestsSucceeded} succeeded
          </Text>
          <Text style={styles.statLine}>
            Data: {(statistics.bytesUploaded / 1024).toFixed(1)}KB up, {(statistics.bytesDownloaded / 1024).toFixed(1)}KB down
          </Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <Button
          title="Discover Available Services"
          onPress={handleDiscoverServices}
          disabled={!isNodeStarted}
        />

        <View style={styles.spacer} />

        <Button
          title={isRecording ? 'Recording...' : 'Start Verification'}
          onPress={handleStartVerification}
          disabled={!isNodeStarted || isRecording}
          color="#4CAF50"
        />
      </View>

      {sessionId && (
        <View style={styles.sessionContainer}>
          <Text style={styles.sessionLabel}>Session ID:</Text>
          <Text style={styles.sessionId}>{sessionId}</Text>
          <Text style={styles.sessionNote}>
            Video submitted to 3 pioneers via P2P network
          </Text>
        </View>
      )}

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>🚀 Revolutionary Features:</Text>
        <Text style={styles.infoLine}>✅ No central servers</Text>
        <Text style={styles.infoLine}>✅ Discover services via P2P</Text>
        <Text style={styles.infoLine}>✅ End-to-end encryption</Text>
        <Text style={styles.infoLine}>✅ Geographic diversity</Text>
        <Text style={styles.infoLine}>✅ Censorship resistant</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 16,
    color: '#666',
  },
  statusConnected: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  statsContainer: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statLine: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  buttonContainer: {
    marginBottom: 20,
  },
  spacer: {
    height: 10,
  },
  sessionContainer: {
    padding: 15,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginBottom: 20,
  },
  sessionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sessionId: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    marginBottom: 10,
  },
  sessionNote: {
    fontSize: 12,
    color: '#4CAF50',
    fontStyle: 'italic',
  },
  infoContainer: {
    padding: 15,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoLine: {
    fontSize: 13,
    color: '#333',
    marginBottom: 5,
  },
});
