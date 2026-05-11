import React, { useState, useRef } from 'react';
import {
	Modal,
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface Props {
	visible: boolean;
	onCancel: () => void;
	onConfirm: (code: string) => void;
	loading?: boolean;
	title?: string;
	subtitle?: string;
}

export default function MfaCodeModal({
	visible,
	onCancel,
	onConfirm,
	loading,
	title,
	subtitle,
}: Props) {
	const { theme: T } = useTheme();
	const [code, setCode] = useState('');
	const inputRef = useRef<TextInput>(null);

	const handleConfirm = () => {
		if (code.length === 6) onConfirm(code);
	};

	const handleClose = () => {
		setCode('');
		onCancel();
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			transparent
			onShow={() => {
				setCode('');
				setTimeout(() => inputRef.current?.focus(), 150);
			}}
		>
			<View style={styles.backdrop}>
				<View style={[styles.sheet, { backgroundColor: T.surface }]}>
					<View style={styles.header}>
						<View style={[styles.iconWrap, { backgroundColor: T.primaryTint }]}>
							<Ionicons
								name="shield-checkmark-outline"
								size={24}
								color={T.primary}
							/>
						</View>
						<TouchableOpacity
							onPress={handleClose}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						>
							<Ionicons name="close" size={22} color={T.textSec} />
						</TouchableOpacity>
					</View>

					<Text style={[styles.title, { color: T.text }]}>
						{title ?? 'Authenticator Code'}
					</Text>
					<Text style={[styles.subtitle, { color: T.textSec }]}>
						{subtitle ??
							'Enter the 6-digit code from your authenticator app to continue.'}
					</Text>

					<TextInput
						ref={inputRef}
						value={code}
						onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
						keyboardType="number-pad"
						maxLength={6}
						style={[
							styles.codeInput,
							{
								backgroundColor: T.surface2,
								borderColor: code.length === 6 ? T.primary : T.border,
								color: T.text,
							},
						]}
						placeholder="000000"
						placeholderTextColor={T.textMuted}
						textAlign="center"
					/>

					<TouchableOpacity
						onPress={handleConfirm}
						disabled={code.length < 6 || loading}
						style={[
							styles.confirmBtn,
							{ backgroundColor: code.length < 6 ? T.surface3 : T.primary },
						]}
						activeOpacity={0.85}
					>
						{loading ? (
							<ActivityIndicator color="#fff" size="small" />
						) : (
							<Text style={styles.confirmBtnText}>Verify & Continue</Text>
						)}
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	sheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 24,
		paddingBottom: 44,
		gap: 16,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	iconWrap: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 18, fontWeight: '700' },
	subtitle: { fontSize: 14, lineHeight: 20 },
	codeInput: {
		height: 56,
		borderRadius: 4,
		borderWidth: 1.5,
		fontSize: 28,
		fontWeight: '700',
		letterSpacing: 12,
	},
	confirmBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
