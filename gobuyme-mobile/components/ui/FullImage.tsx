import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { optimizedUrl } from '@/utils/imageOptimize';

interface Props {
	uri: string;
	// The frame grows to the picture's own proportions up to this height; only taller
	// pictures get side bars. Default suits a form preview.
	maxHeight?: number;
	// Floor so a very wide panorama doesn't collapse to a sliver.
	minHeight?: number;
	backgroundColor?: string;
	style?: StyleProp<ViewStyle>;
	onError?: () => void;
}

// Shows the whole picture with no cropping: width fills the parent and height follows the
// image's aspect ratio (resizeMode="contain" inside it). Counterpart of PositionedImage,
// which crops to a fixed frame.
export function FullImage({ uri, maxHeight = 320, minHeight = 120, backgroundColor, style, onError }: Props) {
	const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		let alive = true;
		setNatural(null);
		Image.getSize(uri, (w, h) => alive && setNatural({ w, h }), () => undefined);
		return () => { alive = false; };
	}, [uri]);

	const aspect = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : null;
	const height = aspect && width > 0 ? Math.min(maxHeight, Math.max(minHeight, width / aspect)) : minHeight;

	return (
		<View
			style={[{ width: '100%', height, backgroundColor, overflow: 'hidden' }, style]}
			onLayout={e => setWidth(e.nativeEvent.layout.width)}
		>
			<Image
				source={{ uri: optimizedUrl(uri, 1200) }}
				style={{ width: '100%', height: '100%' }}
				resizeMode="contain"
				onError={onError}
			/>
		</View>
	);
}
