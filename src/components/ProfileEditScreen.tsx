import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

export const DISPLAY_NAME_KEY = '@aura50_display_name';
export const PROFILE_PIC_KEY  = '@aura50_profile_picture';

interface ProfileEditScreenProps {
  navigation: any;
}

export const ProfileEditScreen: React.FC<ProfileEditScreenProps> = ({ navigation }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState('');
  const [profileUri, setProfileUri]   = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);

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

  // ── Pick image from gallery ─────────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Allow photo library access in Settings to pick a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // allowsEditing disabled: Android's crop editor returns canceled even on
      // success in expo-image-picker v55, causing the image to never save.
      // The circular container handles visual cropping via borderRadius + overflow.
      allowsEditing: Platform.OS === 'ios',
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    const asset = result.assets?.[0];
    if (asset) {
      // Prefer base64 (persists across app restarts); fall back to uri
      const storable = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setProfileUri(storable);
      setDirty(true);
    }
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
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
  }, [displayName, profileUri, navigation]);

  // ── Remove picture ──────────────────────────────────────────────────────────
  const handleRemovePic = useCallback(() => {
    Alert.alert('Remove Photo', 'Remove your profile picture?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(PROFILE_PIC_KEY);
          setProfileUri(null);
          setDirty(true);
        },
      },
    ]);
  }, []);

  const s = makeStyles(colors);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.profileBg }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Custom header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Text style={[s.saveBtnText, { color: colors.accent }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Avatar ── */}
      <View style={s.avatarSection}>
        <TouchableOpacity style={s.avatarWrapper} onPress={pickImage} activeOpacity={0.8}>
          {profileUri ? (
            <Image source={{ uri: profileUri }} style={s.avatarImage} />
          ) : (
            <View style={[s.avatarPlaceholder, { backgroundColor: colors.card2 }]}>
              <Ionicons name="person" size={48} color={colors.accent} />
            </View>
          )}
          {/* Camera badge */}
          <View style={[s.cameraBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="camera" size={14} color="#FFF" />
          </View>
        </TouchableOpacity>

        <Text style={[s.avatarHint, { color: colors.textMuted }]}>Tap to change photo</Text>

        {profileUri && (
          <TouchableOpacity style={s.removeBtn} onPress={handleRemovePic}>
            <Text style={[s.removeBtnText, { color: colors.danger }]}>Remove photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Form ── */}
      <View style={[s.formCard, { backgroundColor: colors.profileCard }]}>
        <Text style={[s.label, { color: colors.textLabel }]}>Display Name</Text>
        <TextInput
          style={[s.input, {
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder,
            color: colors.textPrimary,
          }]}
          value={displayName}
          onChangeText={t => { setDisplayName(t); setDirty(true); }}
          placeholder="e.g. Alex"
          placeholderTextColor={colors.placeholder}
          maxLength={32}
          autoCorrect={false}
        />
        <Text style={[s.inputHint, { color: colors.textMuted }]}>
          {displayName.length}/32 · Shown in greetings and on your card
        </Text>

        <Text style={[s.label, { color: colors.textLabel, marginTop: 18 }]}>Note</Text>
        <Text style={[s.noteText, { color: colors.textMuted }]}>
          Your profile picture and display name are stored locally on this device only. They are never shared with the network.
        </Text>
      </View>
    </ScrollView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4, minWidth: 44, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn: { minWidth: 44, alignItems: 'flex-end', padding: 4 },
  saveBtnText: { fontSize: 16, fontWeight: '700' },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: 28 },
  avatarWrapper: { position: 'relative' },
  avatarImage: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: {
    width: 110, height: 110, borderRadius: 55,
    justifyContent: 'center', alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  avatarHint: { marginTop: 10, fontSize: 13 },
  removeBtn: { marginTop: 8 },
  removeBtnText: { fontSize: 14, fontWeight: '600' },

  // Form
  formCard: {
    marginHorizontal: 16, borderRadius: 16,
    padding: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
  },
  inputHint: { fontSize: 12, marginTop: 6 },
  noteText: { fontSize: 13, lineHeight: 20 },
});
