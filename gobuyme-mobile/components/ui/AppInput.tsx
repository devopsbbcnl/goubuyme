import React from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { radius, spacing } from '@/theme';

interface Props extends Pick<TextInputProps, 'autoCapitalize' | 'autoCorrect' | 'textContentType'> {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  error?: string;
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  error,
  autoCapitalize,
  autoCorrect,
  textContentType,
}: Props) {
  const { theme: T } = useTheme();
  const [visible, setVisible] = React.useState(false);
  const isPassword = !!secureTextEntry;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.label, { color: T.textSec }]}>{label}</Text>
      <View style={[
        styles.inputWrap,
        { backgroundColor: T.surface, borderColor: error ? '#E53E3E' : T.border },
      ]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={T.textMuted}
          secureTextEntry={isPassword && !visible}
          keyboardType={keyboardType}
          autoCapitalize={isPassword ? 'none' : autoCapitalize}
          autoCorrect={isPassword ? false : autoCorrect}
          textContentType={isPassword ? 'password' : textContentType}
          style={[styles.input, { color: T.text, paddingRight: isPassword ? 44 : 16 }]}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setVisible(v => !v)}
            style={styles.eyeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.75}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={T.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6, fontFamily: 'PlusJakartaSans_700Bold',
  },
  inputWrap: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    position: 'relative',
  },
  input: {
    paddingVertical: 14,
    paddingLeft: 16,
    fontSize: 15, fontFamily: 'PlusJakartaSans_400Regular',
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 12,
    marginTop: 6,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
});
