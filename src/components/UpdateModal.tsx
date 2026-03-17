import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Platform,
} from 'react-native';
import type { UpdateInfo } from '../services/UpdateCheckerService';

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateModal({ updateInfo, onDismiss }: UpdateModalProps) {
  const { forceUpdate, latestVersion, releaseNotes, downloadUrl } = updateInfo;

  const handleDownload = () => {
    if (downloadUrl) {
      Linking.openURL(downloadUrl).catch(() => {});
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={forceUpdate ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <Text style={styles.title}>Update Available 🚀</Text>
          <Text style={styles.versionBadge}>v{latestVersion}</Text>

          {/* Force-update notice */}
          {forceUpdate && (
            <Text style={styles.forceNotice}>
              This update is required to continue
            </Text>
          )}

          {/* Release notes */}
          {releaseNotes ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>What's new</Text>
              <Text style={styles.notesText}>{releaseNotes}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <TouchableOpacity
            style={styles.downloadButton}
            activeOpacity={0.85}
            onPress={handleDownload}
          >
            <Text style={styles.downloadButtonText}>Download Update</Text>
          </TouchableOpacity>

          {!forceUpdate && (
            <TouchableOpacity
              style={styles.laterButton}
              activeOpacity={0.7}
              onPress={onDismiss}
            >
              <Text style={styles.laterButtonText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#141E28',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    // Subtle border using the accent colour
    borderWidth: 1,
    borderColor: '#2A3F55',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    // Elevation for Android
    elevation: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  versionBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5DADE2',
    backgroundColor: 'rgba(93, 173, 226, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  forceNotice: {
    fontSize: 14,
    color: '#E74C3C',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  notesContainer: {
    alignSelf: 'stretch',
    backgroundColor: '#1C2833',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#566573',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  notesText: {
    fontSize: 14,
    color: '#A9B7C6',
    lineHeight: 20,
  },
  downloadButton: {
    backgroundColor: '#5DADE2',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 10,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  laterButton: {
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  laterButtonText: {
    color: '#566573',
    fontSize: 15,
    fontWeight: '500',
  },
});
