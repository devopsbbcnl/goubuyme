import React, { useEffect, useState } from 'react';
import {
	Modal, KeyboardAvoidingView, Keyboard, View, Pressable,
	StyleSheet, Platform, StyleProp, ViewStyle, useWindowDimensions,
} from 'react-native';

interface Props {
	visible: boolean;
	onRequestClose?: () => void;
	onShow?: () => void;
	onBackdropPress?: () => void;
	children: React.ReactNode;
	cardStyle?: StyleProp<ViewStyle>;
	maxHeight?: number | `${number}%`;
}

// Backdrop padding (top+bottom) plus a small buffer so the last field/button in the
// card clears the keyboard by a visible margin instead of sitting flush against it.
const VERTICAL_CHROME = 40 + 16;

function resolveMaxHeight(value: number | `${number}%`, base: number): number {
	if (typeof value === 'number') return value;
	return (parseFloat(value) / 100) * base;
}

// Centered dialog that stays clear of the keyboard by living inside a flex:1
// KeyboardAvoidingView at the screen root — the previous bottom-sheet pattern nested
// KeyboardAvoidingView with `flex: undefined` inside a flex-end-justified backdrop,
// which produced inconsistent padding/offset behavior across devices. Centering the
// card removes the need for that trick entirely: the keyboard shrinks the available
// space and the card's content scrolls within it.
//
// The card's own maxHeight is additionally capped from tracked keyboard height rather
// than relying solely on native keyboard-avoidance: Modal renders in its own native
// window on Android, which doesn't reliably inherit the host Activity's
// windowSoftInputMode="adjustResize" behavior, so without this the card can extend
// behind the keyboard with no way to scroll the last field/button into view.
export function CenteredKeyboardModal({
	visible,
	onRequestClose,
	onShow,
	onBackdropPress,
	children,
	cardStyle,
	maxHeight = '85%',
}: Props) {
	const { height: windowHeight } = useWindowDimensions();
	const [keyboardHeight, setKeyboardHeight] = useState(0);

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
		const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, []);

	const resolvedMaxHeight = keyboardHeight > 0
		? Math.min(resolveMaxHeight(maxHeight, windowHeight), windowHeight - keyboardHeight - VERTICAL_CHROME)
		: maxHeight;

	return (
		<Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose} onShow={onShow}>
			<KeyboardAvoidingView
				style={styles.backdrop}
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			>
				{onBackdropPress && <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />}
				<View style={[styles.card, { maxHeight: resolvedMaxHeight }, cardStyle]}>{children}</View>
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
