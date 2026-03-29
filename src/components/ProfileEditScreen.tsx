import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

export const DISPLAY_NAME_KEY = '@aura50_display_name';
export const PROFILE_PIC_KEY  = '@aura50_profile_picture';

interface ProfileEditScreenProps {
  navigation: any;
}

export const ProfileEditScreen: React.FC<ProfileEditScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState('');
  const [profileUri, setProfileUri]   = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);
  const [focused, setFocused]         = useState(false);

  const borderAnim = useRef(new Animated.Value(0)).current;
  const saveScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      const [name, pic] = await Promise.all([
        AsyncStorage.getItem(DISPLAY_NAME_KEY),
        AsyncStorage.getItem(PROFILE_PIC_KEY),
      ]);
      if (name) setDisplayName(name);
      if (pic)  setProfileUri(pic);
    })();
  }, []);

  const animateBorder = useCallback((to: number) => {
    Animated.spring(borderAnim, {
      toValue: to,
      useNativeDriver: false,
      tension: 140,
      friction: 9,
    }).start();
  }, [borderAnim]);

  // ── Pick from gallery ────────────────────────────────────────────────────────
  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Allow photo library access in Settings.');
      return;
    }
    // Fix: use string[] (MediaType is a TS type, not a runtime object in expo-image-picker v15+)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProfileUri(asset.uri);
      setDirty(true);
    }
  }, []);

  // ── Take photo ───────────────────────────────────────────────────────────────
  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Allow camera access in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProfileUri(asset.uri);
      setDirty(true);
    }
  }, []);

  // ── Remove photo ─────────────────────────────────────────────────────────────
  const removePhoto = useCallback(() => {
    AsyncStorage.removeItem(PROFILE_PIC_KEY);
    setProfileUri(null);
    setDirty(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  // ── Action sheet ─────────────────────────────────────────────────────────────
  const showPhotoOptions = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Take Photo',          onPress: takePhoto },
    ];
    if (profileUri) {
      buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: removePhoto });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile Photo', 'Choose an option', buttons);
  }, [pickFromLibrary, takePhoto, removePhoto, profileUri]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!displayName.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Button press bounce
    Animated.sequence([
      Animated.timing(saveScale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(saveScale, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();

    setSaving(true);
    try {
      await Promise.all([
        AsyncStorage.setItem(DISPLAY_NAME_KEY, displayName.trim()),
        profileUri
          ? AsyncStorage.setItem(PROFILE_PIC_KEY, profileUri)
          : Promise.resolve(),
      ]);
      setDirty(false);
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [displayName, profileUri, navigation, saveScale]);

  const animatedBorderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      isDark ? 'rgba(93,173,226,0.22)' : 'rgba(37,99,235,0.2)',
      isDark ? '#5DADE2'               : '#2563EB',
    ],
  });

  const bgColor  = isDark ? '#0D1B2A' : '#F0F4F8';
  const cardBg   = isDark ? 'rgba(20,35,50,0.85)' : 'rgba(255,255,255,0.82)';
  const ringBg   = isDark ? '#0D1B2A'  : '#F0F4F8';

  return (
    <View style={[styles.screen, { backgroundColor: bgColor }]}>

      {/* ── Header — blur on iOS, solid on Android ──────────────────────── */}
      <BlurView
        intensity={Platform.OS === 'ios' ? (isDark ? 55 : 75) : 0}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.header,
          { paddingTop: insets.top + 6, backgroundColor: Platform.OS === 'android' ? bgColor : 'transparent' },
        ]}
      >
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <View style={[styles.headerBtnInner, { backgroundColor: isDark ? 'rgba(93,173,226,0.12)' : 'rgba(37,99,235,0.08)' }]}>
            <Ionicons name="chevron-back" size={20} color={colors.accent} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Edit Profile</Text>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleSave}
          disabled={saving}
          accessibilityLabel="Save profile"
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.accent} style={styles.headerBtnInner} />
            : <Text style={[
                styles.headerSave,
                { color: dirty ? colors.accent : colors.textMuted },
              ]}>
                Save
              </Text>
          }
        </TouchableOpacity>
      </BlurView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Avatar section ──────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', delay: 60, damping: 18 }}
          style={styles.avatarSection}
        >
          <TouchableOpacity
            onPress={showPhotoOptions}
            activeOpacity={0.82}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
          >
            {/* Gradient glow ring */}
            <LinearGradient
              colors={isDark
                ? ['#5DADE2', '#8E44AD', '#E74C3C', '#5DADE2']
                : ['#2563EB', '#7C3AED', '#DB2777', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              {/* Inner gap ring */}
              <View style={[styles.avatarGap, { backgroundColor: ringBg }]}>
                {profileUri ? (
                  <Image
                    source={{ uri: profileUri }}
                    style={styles.avatarImage}
                    accessibilityLabel="Profile picture"
                  />
                ) : (
                  <LinearGradient
                    colors={isDark ? ['#1A2B3C', '#243447'] : ['#E8F4FD', '#D6EAF8']}
                    style={styles.avatarPlaceholder}
                  >
                    <Ionicons name="person" size={54} color={colors.accent} />
                  </LinearGradient>
                )}
              </View>
            </LinearGradient>

            {/* Camera badge */}
            <MotiView
              from={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 280, damping: 12 }}
              style={styles.cameraBadge}
            >
              <LinearGradient
                colors={[colors.accent, colors.accentAlt]}
                style={styles.cameraBadgeGrad}
              >
                <Ionicons name="camera" size={13} color="#FFF" />
              </LinearGradient>
            </MotiView>
          </TouchableOpacity>

          <Text style={[styles.avatarHint, { color: colors.textMuted }]}>
            Tap to change photo
          </Text>
        </MotiView>

        {/* ── Form glass card ─────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', delay: 130, damping: 18 }}
          style={[styles.cardOuter, {
            borderColor: isDark ? 'rgba(93,173,226,0.15)' : 'rgba(37,99,235,0.12)',
            backgroundColor: cardBg,
          }]}
        >
          {/* iOS only: frosted glass layer — skipped on Android to keep render cost low */}
          {Platform.OS === 'ios' && (
            <BlurView
              intensity={isDark ? 45 : 65}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.cardContent}>

            {/* Section label */}
            <Text style={[styles.sectionLabel, { color: colors.accent }]}>
              DISPLAY NAME
            </Text>

            {/* Animated input */}
            <Animated.View style={[
              styles.inputWrapper,
              {
                borderColor: animatedBorderColor,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              },
            ]}>
              <Ionicons
                name="person-outline"
                size={16}
                color={focused ? colors.accent : colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={displayName}
                onChangeText={t => { setDisplayName(t); setDirty(true); }}
                placeholder="Your display name"
                placeholderTextColor={colors.placeholder}
                maxLength={32}
                autoCorrect={false}
                onFocus={() => { setFocused(true);  animateBorder(1); }}
                onBlur={() =>  { setFocused(false); animateBorder(0); }}
                returnKeyType="done"
              />
              <Text style={[
                styles.charCount,
                { color: displayName.length >= 28 ? colors.danger : colors.textMuted },
              ]}>
                {displayName.length}/32
              </Text>
            </Animated.View>

            {/* Divider */}
            <View style={[styles.divider, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }]} />

            {/* Privacy note */}
            <View style={styles.noteRow}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.noteText, { color: colors.textMuted }]}>
                Stored locally — never shared with the network
              </Text>
            </View>

          </View>
        </MotiView>

        {/* ── Save button ─────────────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', delay: 200, damping: 18 }}
        >
          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <TouchableOpacity
              style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.88}
              accessibilityLabel="Save profile"
              accessibilityRole="button"
            >
              <LinearGradient
                colors={[colors.accent, colors.accentAlt]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtnGrad}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={19} color="#FFF" />
                    <Text style={styles.saveBtnText}>Save Profile</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </MotiView>

      </ScrollView>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(93,173,226,0.2)',
  },
  headerBtn:      { minWidth: 60, paddingVertical: 4 },
  headerBtnInner: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle:    { fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  headerSave:     { fontSize: 16, fontWeight: '700', textAlign: 'right' },

  scrollContent: { paddingBottom: 64 },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: 38 },

  avatarRing: {
    width: 132, height: 132, borderRadius: 66,
    padding: 3,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarGap: {
    width: 126, height: 126, borderRadius: 63,
    padding: 3,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarImage: {
    width: 120, height: 120, borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120, height: 120, borderRadius: 60,
    justifyContent: 'center', alignItems: 'center',
  },

  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  cameraBadgeGrad: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: '#0D1B2A',
  },

  avatarHint: { marginTop: 14, fontSize: 13, fontWeight: '500', letterSpacing: 0.1 },

  // Form card
  cardOuter: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 22,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.4,
    marginBottom: 14,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  inputIcon: { marginRight: 9 },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,   // remove default Android padding
  },
  charCount: { fontSize: 11, fontWeight: '600', marginLeft: 6 },

  divider: { height: 1, marginVertical: 18 },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { fontSize: 12.5, flex: 1, lineHeight: 18 },

  // Save
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 22,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#5DADE2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  saveBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
