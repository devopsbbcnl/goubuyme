import React from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

// Shared keyboard-avoidance behavior so text inputs near the bottom of a screen
// (or inside a modal) never end up hidden behind the on-screen keyboard.
export function KeyboardAvoidingWrapper({ children, style, keyboardVerticalOffset = 0 }: Props) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
