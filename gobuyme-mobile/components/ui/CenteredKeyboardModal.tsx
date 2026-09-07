import React, { useEffect, useState } from 'react';
import {
	Modal, Keyboard, View, Pressable,
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

// Backdrop padding (top+bottom) plus a buffer so the last field/button in the card
// clears the keyboard by a visible margin instead of sitting flush against it.
const VERTICAL_CHROME = 40 + 28;

function resolveMaxHeight(value: number | `${number}%`, base: number): number {
	if (typeof value === 'number') return value;
	return (parseFloat(value) / 100) * base;
}

// Centered dialog that stays clear of the keyboard by reserving the tracked keyboard
// height as real bottom padding on the backdrop, on every platform. The backdrop is a
// plain flex:1 / justify-center View, so that padding shrinks the centering region to
// the space *above* the keyboard and the card floats up into it — rather than relying
// on KeyboardAvoidingView, which does nothing on Android (Modal renders in its own
// native window that doesn't inherit the Activity's windowSoftInputMode="adjustResize")
// and only partly compensates on iOS.
//
// The card's own maxHeight is additionally capped from the tracked keyboard height so
// that, once the card is as tall as the available space, its inner ScrollView takes
// over and every field/button can still be scrolled into view.
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
			<View style={[styles.backdrop, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}>
				{onBackdropPress && <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />}
				<View style={[styles.card, { maxHeight: resolvedMaxHeight }, cardStyle]}>{children}</View>
			</View>
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
