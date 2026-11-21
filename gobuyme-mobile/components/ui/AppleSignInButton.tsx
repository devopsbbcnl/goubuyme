import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAppleSignIn, AppleButtonModule } from '@/hooks/useAppleSignIn';

type Props = { kind?: 'SIGN_IN' | 'SIGN_UP' | 'CONTINUE' };

/**
 * Apple's own button (App Store rule: use the system button, at least as prominent as other
 * third-party sign-in options). Renders nothing off iOS, in Expo Go, or where Apple sign-in is unavailable.
 */
export default function AppleSignInButton({ kind = 'CONTINUE' }: Props) {
  const { isDark } = useTheme();
  const { promptAppleSignIn, appleBusy, appleAvailable, appleError } = useAppleSignIn();

  if (!AppleButtonModule || !appleAvailable) return null;
  const { AppleAuthenticationButton, AppleAuthenticationButtonType, AppleAuthenticationButtonStyle } = AppleButtonModule;

  const type =
    kind === 'SIGN_IN' ? AppleAuthenticationButtonType.SIGN_IN
    : kind === 'SIGN_UP' ? AppleAuthenticationButtonType.SIGN_UP
    : AppleAuthenticationButtonType.CONTINUE;

  return (
    <View style={{ gap: 8, marginBottom: 14 }}>
      {!!appleError && (
        <Text style={{ color: '#E53E3E', textAlign: 'center', fontSize: 13 }}>{appleError}</Text>
      )}
      <View style={{ opacity: appleBusy ? 0.6 : 1 }}>
        <AppleAuthenticationButton
          buttonType={type}
          buttonStyle={isDark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={4}
          style={{ height: 48, width: '100%' }}
          onPress={() => { if (!appleBusy) void promptAppleSignIn(); }}
        />
        {appleBusy && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <ActivityIndicator color={isDark ? '#000' : '#fff'} />
          </View>
        )}
      </View>
    </View>
  );
}
