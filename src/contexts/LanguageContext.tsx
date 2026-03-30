import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { languages } from '../i18n/languages';

interface LanguageContextType {
  currentLanguage: string;
  setLanguage: (languageCode: string) => Promise<void>;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [isLoading, setIsLoading] = useState(true);

  // Load language preference on mount
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('@aura50_language');
        if (savedLanguage && languages.some(l => l.code === savedLanguage)) {
          setCurrentLanguage(savedLanguage);
          await i18n.changeLanguage(savedLanguage);

          // Handle RTL languages
          const selectedLang = languages.find(l => l.code === savedLanguage);
          if (selectedLang?.rtl) {
            I18nManager.forceRTL(true);
          } else {
            I18nManager.forceRTL(false);
          }
        }
      } catch (error) {
        console.error('Failed to load language preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, [i18n]);

  const setLanguage = async (languageCode: string) => {
    try {
      // Verify language exists
      if (!languages.some(l => l.code === languageCode)) {
        console.error(`Language ${languageCode} not found`);
        return;
      }

      // Save to AsyncStorage
      await AsyncStorage.setItem('@aura50_language', languageCode);

      // Update i18n
      await i18n.changeLanguage(languageCode);
      setCurrentLanguage(languageCode);

      // Handle RTL languages
      const selectedLang = languages.find(l => l.code === languageCode);
      if (selectedLang?.rtl) {
        I18nManager.forceRTL(true);
      } else {
        I18nManager.forceRTL(false);
      }
    } catch (error) {
      console.error('Failed to set language:', error);
    }
  };

  return (
    <LanguageContext.Provider value={{ currentLanguage, setLanguage, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
