import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ThemePickerModal({ visible, onClose }: Props) {
  const { colors, themeId, setTheme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Appearance</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Options */}
        <View style={styles.options}>
          {/* Dark */}
          <TouchableOpacity
            style={[
              styles.option,
              { backgroundColor: colors.card2, borderColor: colors.cardBorder },
              themeId === 'dark' && { borderColor: colors.accent },
            ]}
            onPress={() => { setTheme('dark'); onClose(); }}
            activeOpacity={0.8}
          >
            <View style={[styles.preview, { backgroundColor: '#141E28' }]}>
              <View style={[styles.previewBar, { backgroundColor: '#1C2833' }]} />
              <View style={[styles.previewBar, { backgroundColor: '#1C2833', width: '65%' }]} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionName, { color: colors.textPrimary }]}>Dark</Text>
              <Text style={[styles.optionDesc, { color: colors.textMuted }]}>Night mode</Text>
            </View>
            {themeId === 'dark' && (
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            )}
          </TouchableOpacity>

          {/* Light */}
          <TouchableOpacity
            style={[
              styles.option,
              { backgroundColor: colors.card2, borderColor: colors.cardBorder },
              themeId === 'light' && { borderColor: colors.accent },
            ]}
            onPress={() => { setTheme('light'); onClose(); }}
            activeOpacity={0.8}
          >
            <View style={[styles.preview, { backgroundColor: '#F9FAFB' }]}>
              <View style={[styles.previewBar, { backgroundColor: '#E5E7EB' }]} />
              <View style={[styles.previewBar, { backgroundColor: '#E5E7EB', width: '65%' }]} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionName, { color: colors.textPrimary }]}>Light</Text>
              <Text style={[styles.optionDesc, { color: colors.textMuted }]}>Day mode</Text>
            </View>
            {themeId === 'light' && (
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  preview: {
    width: 52,
    height: 36,
    borderRadius: 6,
    padding: 6,
    gap: 4,
  },
  previewBar: {
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
