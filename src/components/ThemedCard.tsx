import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export default function ThemedCard({ children, style, padding = 16 }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 12,
          padding,
          borderWidth: 1,
          borderColor: colors.cardBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
