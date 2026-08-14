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
import { KeyboardAvoidingWrapper } from '@/components/ui/KeyboardAvoidingWrapper';

interface Props {
	visible: boolean;
	onCancel: () => void;
	onConfirm: (pin: string) => void;
	loading?: boolean;
	error?: string | null;
}

// Rider enters the 4-digit PIN the customer reads out to confirm the order was received.
export default function DeliveryPinModal({
	visible,
	onCancel,
	onConfirm,
	loading,
	error,
}: Props) {
	const { theme: T } = useTheme();
	const [pin, setPin] = useState('');
	const inputRef = useRef<TextInput>(null);

	const handleConfirm = () => {
		if (pin.length === 4) onConfirm(pin);
	};

	const handleClose = () => {
		setPin('');
		onCancel();
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			transparent
			onShow={() => {
				setPin('');
				setTimeout(() => inputRef.current?.focus(), 150);
			}}
		>
			<View style={styles.backdrop}>
				<KeyboardAvoidingWrapper style={{ flex: undefined }}>
				<View style={[styles.sheet, { backgroundColor: T.surface }]}>
					<View style={styles.header}>
						<View style={[styles.iconWrap, { backgroundColor: T.primaryTint }]}>
							<Ionicons name="lock-closed-outline" size={24} color={T.primary} />
						</View>
						<TouchableOpacity
							onPress={handleClose}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						>
							<Ionicons name="close" size={22} color={T.textSec} />
						</TouchableOpacity>
					</View>

					<Text style={[styles.title, { color: T.text }]}>Delivery PIN</Text>
					<Text style={[styles.subtitle, { color: T.textSec }]}>
						Ask the customer for their 4-digit delivery PIN and enter it to
						confirm the handover.
					</Text>

					<TextInput
						ref={inputRef}
						value={pin}
						onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
						keyboardType="number-pad"
						maxLength={4}
						style={[
							styles.codeInput,
							{
								backgroundColor: T.surface2,
								borderColor: error
									? '#E5484D'
									: pin.length === 4
										? T.primary
										: T.border,
								color: T.text,
							},
						]}
						placeholder="0000"
						placeholderTextColor={T.textMuted}
						textAlign="center"
					/>

					{error ? (
						<Text style={styles.errorText}>{error}</Text>
					) : null}

					<TouchableOpacity
						onPress={handleConfirm}
						disabled={pin.length < 4 || loading}
						style={[
							styles.confirmBtn,
							{ backgroundColor: pin.length < 4 ? T.surface3 : T.primary },
						]}
						activeOpacity={0.85}
					>
						{loading ? (
							<ActivityIndicator color="#fff" size="small" />
						) : (
							<Text style={styles.confirmBtnText}>Confirm Delivery</Text>
						)}
					</TouchableOpacity>
				</View>
				</KeyboardAvoidingWrapper>
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
		letterSpacing: 16,
	},
	errorText: { color: '#E5484D', fontSize: 13, fontWeight: '600', marginTop: -8 },
	confirmBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
