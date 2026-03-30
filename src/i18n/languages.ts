export interface Language {
  code: string;
  name: string;       // English name
  nativeName: string; // Name in the language itself
  flag: string;       // Flag emoji
  rtl: boolean;
}

export const languages: Language[] = [
  { code: 'en',    name: 'English',             nativeName: 'English',           flag: '🇬🇧', rtl: false },
  { code: 'es',    name: 'Spanish',             nativeName: 'Español',           flag: '🇪🇸', rtl: false },
  { code: 'pt',    name: 'Portuguese',          nativeName: 'Português',         flag: '🇧🇷', rtl: false },
  { code: 'fr',    name: 'French',              nativeName: 'Français',          flag: '🇫🇷', rtl: false },
  { code: 'de',    name: 'German',              nativeName: 'Deutsch',           flag: '🇩🇪', rtl: false },
  { code: 'it',    name: 'Italian',             nativeName: 'Italiano',          flag: '🇮🇹', rtl: false },
  { code: 'nl',    name: 'Dutch',               nativeName: 'Nederlands',        flag: '🇳🇱', rtl: false },
  { code: 'ru',    name: 'Russian',             nativeName: 'Русский',           flag: '🇷🇺', rtl: false },
  { code: 'uk',    name: 'Ukrainian',           nativeName: 'Українська',        flag: '🇺🇦', rtl: false },
  { code: 'pl',    name: 'Polish',              nativeName: 'Polski',            flag: '🇵🇱', rtl: false },
  { code: 'ro',    name: 'Romanian',            nativeName: 'Română',            flag: '🇷🇴', rtl: false },
  { code: 'tr',    name: 'Turkish',             nativeName: 'Türkçe',            flag: '🇹🇷', rtl: false },
  { code: 'ar',    name: 'Arabic',              nativeName: 'العربية',           flag: '🇸🇦', rtl: true  },
  { code: 'fa',    name: 'Persian',             nativeName: 'فارسی',             flag: '🇮🇷', rtl: true  },
  { code: 'hi',    name: 'Hindi',               nativeName: 'हिन्दी',            flag: '🇮🇳', rtl: false },
  { code: 'bn',    name: 'Bengali',             nativeName: 'বাংলা',             flag: '🇧🇩', rtl: false },
  { code: 'ur',    name: 'Urdu',                nativeName: 'اردو',              flag: '🇵🇰', rtl: true  },
  { code: 'zh',    name: 'Chinese (Simplified)',  nativeName: '中文（简体）',    flag: '🇨🇳', rtl: false },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文（繁體）',   flag: '🇹🇼', rtl: false },
  { code: 'ja',    name: 'Japanese',            nativeName: '日本語',            flag: '🇯🇵', rtl: false },
  { code: 'ko',    name: 'Korean',              nativeName: '한국어',            flag: '🇰🇷', rtl: false },
  { code: 'vi',    name: 'Vietnamese',          nativeName: 'Tiếng Việt',        flag: '🇻🇳', rtl: false },
  { code: 'th',    name: 'Thai',                nativeName: 'ภาษาไทย',           flag: '🇹🇭', rtl: false },
  { code: 'id',    name: 'Indonesian',          nativeName: 'Bahasa Indonesia',  flag: '🇮🇩', rtl: false },
  { code: 'ms',    name: 'Malay',               nativeName: 'Bahasa Melayu',     flag: '🇲🇾', rtl: false },
  { code: 'tl',    name: 'Filipino',            nativeName: 'Filipino',          flag: '🇵🇭', rtl: false },
  { code: 'sw',    name: 'Swahili',             nativeName: 'Kiswahili',         flag: '🇰🇪', rtl: false },
  { code: 'sv',    name: 'Swedish',             nativeName: 'Svenska',           flag: '🇸🇪', rtl: false },
  { code: 'el',    name: 'Greek',               nativeName: 'Ελληνικά',          flag: '🇬🇷', rtl: false },
  { code: 'cs',    name: 'Czech',               nativeName: 'Čeština',           flag: '🇨🇿', rtl: false },
];
