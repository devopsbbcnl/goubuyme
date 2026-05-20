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
  prefix?: string;
  labelRight?: React.ReactNode;
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  error,
  prefix,
  labelRight,
  autoCapitalize,
  autoCorrect,
  textContentType,
}: Props) {
  const { theme: T } = useTheme();
  const [visible, setVisible] = React.useState(false);
  const isPassword = !!secureTextEntry;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: T.textSec }]}>{label}</Text>
        {labelRight}
      </View>
      <View style={[
        styles.inputWrap,
        { backgroundColor: T.surface, borderColor: error ? '#E53E3E' : T.border },
      ]}>
        {prefix && (
          <View style={[styles.prefixBox, { borderRightColor: error ? '#E53E3E' : T.border }]}>
            <Text style={[styles.prefixText, { color: T.textSec }]}>{prefix}</Text>
          </View>
        )}
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
          style={[styles.input, { color: T.text, paddingRight: isPassword ? 44 : 16, paddingLeft: prefix ? 12 : 16 }]}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  inputWrap: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefixBox: {
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  prefixText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  input: {
    flex: 1,
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
