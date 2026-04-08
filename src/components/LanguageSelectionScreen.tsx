import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  SafeAreaView, StyleSheet, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { languages, Language } from '../i18n/languages';

interface LanguageSelectionScreenProps {
  isModal?: boolean;
  onComplete?: () => void;
}

const DOWNLOAD_URL = 'https://aura50.org/downloads/aura50.apk';

export const LanguageSelectionScreen: React.FC<LanguageSelectionScreenProps> = ({
  isModal = false,
  onComplete,
}) => {
  const { t } = useTranslation();
  const { setLanguage, currentLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState(currentLanguage);

  const filteredLanguages = useMemo(() => {
    if (!searchQuery.trim()) return languages;
    const q = searchQuery.toLowerCase();
    return languages.filter(
      l => l.name.toLowerCase().includes(q) ||
           l.nativeName.toLowerCase().includes(q) ||
           l.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleConfirm = async () => {
    await setLanguage(selected);
    onComplete?.();
  };

  const renderItem = ({ item }: { item: Language }) => {
    const isSelected = item.code === selected;
    return (
      <TouchableOpacity
        onPress={() => setSelected(item.code)}
        activeOpacity={0.75}
        style={[styles.item, isSelected && styles.itemSelected]}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <View style={styles.itemText}>
          <Text style={[styles.nativeName, isSelected && styles.nameSelected]}>{item.nativeName}</Text>
          <Text style={styles.englishName}>{item.name}</Text>
        </View>
        {isSelected
          ? <View style={styles.checkCircle}><Ionicons name="checkmark" size={14} color="#06b6d4" /></View>
          : <View style={styles.emptyCircle} />
        }
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#060C18" />

      {/* Header */}
      <View style={styles.header}>
        {isModal && (
          <TouchableOpacity onPress={onComplete} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        )}
        <View style={styles.headerIcon}>
          <Ionicons name="globe-outline" size={28} color="#06b6d4" />
        </View>
        <Text style={styles.title}>
          {isModal ? t('langScreen.changeTitle') : t('langScreen.title')}
        </Text>
        <Text style={styles.subtitle}>
          {isModal ? t('langScreen.changeSubtitle') : t('langScreen.subtitle')}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
        <TextInput
          placeholder={t('langScreen.searchPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filteredLanguages}
        renderItem={renderItem}
        keyExtractor={i => i.code}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {/* Confirm button */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleConfirm} activeOpacity={0.85} style={styles.btnWrap}>
          <LinearGradient
            colors={['#06b6d4', '#0284c7']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.btn}
          >
            <Text style={styles.btnText}>
              {isModal ? t('common.save') : t('langScreen.continueBtn')}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060C18' },
  header: { alignItems: 'center', paddingTop: 20, paddingBottom: 12, paddingHorizontal: 20 },
  closeBtn: { position: 'absolute', top: 20, right: 20, padding: 4 },
  headerIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 18 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 12 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  itemSelected: {
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderColor: 'rgba(6,182,212,0.45)',
  },
  flag: { fontSize: 22, marginRight: 12, width: 32, textAlign: 'center' },
  itemText: { flex: 1 },
  nativeName: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: 1 },
  nameSelected: { color: '#fff' },
  englishName: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(6,182,212,0.2)',
    borderWidth: 1.5, borderColor: '#06b6d4',
    justifyContent: 'center', alignItems: 'center',
  },
  emptyCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  footer: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  btnWrap: { borderRadius: 14, overflow: 'hidden' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export const LanguagePickerModal = LanguageSelectionScreen;
