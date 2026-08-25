import React from 'react';
import { Modal, KeyboardAvoidingView, View, Pressable, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';

interface Props {
	visible: boolean;
	onRequestClose?: () => void;
	onShow?: () => void;
	onBackdropPress?: () => void;
	children: React.ReactNode;
	cardStyle?: StyleProp<ViewStyle>;
	maxHeight?: number | `${number}%`;
}

// Centered dialog that stays clear of the keyboard by living inside a flex:1
// KeyboardAvoidingView at the screen root — the previous bottom-sheet pattern nested
// KeyboardAvoidingView with `flex: undefined` inside a flex-end-justified backdrop,
// which produced inconsistent padding/offset behavior across devices. Centering the
// card removes the need for that trick entirely: the keyboard simply shrinks the
// available space and the (already scrollable) card content scrolls within it.
export function CenteredKeyboardModal({
	visible,
	onRequestClose,
	onShow,
	onBackdropPress,
	children,
	cardStyle,
	maxHeight = '85%',
}: Props) {
	return (
		<Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose} onShow={onShow}>
			<KeyboardAvoidingView
				style={styles.backdrop}
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			>
				{onBackdropPress && <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />}
				<View style={[styles.card, { maxHeight }, cardStyle]}>{children}</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	card: {
		width: '100%',
		maxWidth: 420,
		borderRadius: 20,
		overflow: 'hidden',
		flexShrink: 1,
	},
});
