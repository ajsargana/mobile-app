import { Platform } from 'react-native';

/**
 * Scale font size for Android to reduce card section sizes.
 * iPhone UI is kept exactly as designed.
 * Android receives a 0.9× scaling factor (~10% reduction).
 */
export const scaleFontSize = (size: number): number => {
  if (Platform.OS === 'android') {
    return Math.round(size * 0.9);
  }
  return size;
};

/**
 * Apply font scaling to an entire StyleSheet object.
 * Recursively scales all fontSize properties.
 */
export const applyFontScaling = (styles: any): any => {
  if (Platform.OS === 'ios') {
    return styles; // No scaling needed for iOS
  }

  const scaled: any = {};

  for (const key in styles) {
    if (styles.hasOwnProperty(key)) {
      const style = styles[key];

      if (typeof style === 'object' && style !== null) {
        scaled[key] = { ...style };

        // Scale fontSize if it exists
        if (typeof style.fontSize === 'number') {
          scaled[key].fontSize = scaleFontSize(style.fontSize);
        }
      } else {
        scaled[key] = style;
      }
    }
  }

  return scaled;
};
