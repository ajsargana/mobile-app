import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, SafeAreaView, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { languages, Language } from '../i18n/languages';

interface LanguageSelectionScreenProps {
  isModal?: boolean;
  onComplete?: () => void;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  listContainer: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    margin: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  languageItemSelected: {
    backgroundColor: '#06b6d4',
    borderColor: '#0891b2',
  },
  languageItemUnselected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  flag: {
    fontSize: 24,
    marginRight: 12,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageName: {
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  languageEnglishName: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#06b6d4',
    fontWeight: 'bold',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  button: {
    backgroundColor: '#06b6d4',
    paddingVertical: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export const LanguageSelectionScreen: React.FC<LanguageSelectionScreenProps> = ({
  isModal = false,
  onComplete,
}) => {
  const { t } = useTranslation();
  const { setLanguage, currentLanguage } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLanguages = useMemo(() => {
    if (!searchQuery.trim()) return languages;

    const query = searchQuery.toLowerCase();
    return languages.filter(
      lang =>
        lang.name.toLowerCase().includes(query) ||
        lang.nativeName.toLowerCase().includes(query) ||
        lang.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleSelectLanguage = async (languageCode: string) => {
    await setLanguage(languageCode);
    if (onComplete) {
      onComplete();
    }
  };

  const renderLanguageItem = ({ item }: { item: Language }) => {
    const isSelected = item.code === currentLanguage;
    return (
      <TouchableOpacity
        onPress={() => handleSelectLanguage(item.code)}
        style={[
          styles.languageItem,
          isSelected ? styles.languageItemSelected : styles.languageItemUnselected,
        ]}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <View style={styles.languageTextContainer}>
          <Text style={styles.languageName}>{item.nativeName}</Text>
          <Text style={styles.languageEnglishName}>{item.name}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const title = isModal ? t('langScreen.changeTitle') : t('langScreen.title');
  const subtitle = isModal ? t('langScreen.changeSubtitle') : t('langScreen.subtitle');
  const buttonText = isModal ? t('common.save') : t('langScreen.continueBtn');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          placeholder={t('langScreen.searchPlaceholder')}
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={filteredLanguages}
        renderItem={renderLanguageItem}
        keyExtractor={item => item.code}
        numColumns={1}
        contentContainerStyle={styles.listContainer}
        scrollEnabled={true}
      />

      {!isModal && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={() => onComplete?.()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

// Export as modal variant
export const LanguagePickerModal = LanguageSelectionScreen;
