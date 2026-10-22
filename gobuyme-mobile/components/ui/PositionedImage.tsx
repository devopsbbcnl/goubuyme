import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { parsePosition } from '@/utils/imagePosition';

interface Props {
  uri: string;
  // Saved "x% y%"; absent is centred.
  position?: string | null;
  // Sizes the frame (width/height/borderRadius...), like the style of an <Image> with resizeMode="cover".
  style?: StyleProp<ViewStyle | ImageStyle>;
  onError?: () => void;
}

// resizeMode="cover" with a movable crop. React Native's Image has no object-position,
// so the covered size is worked out from the picture's own size and the frame's layout.
export function PositionedImage({ uri, position, style, onError }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    Image.getSize(uri, (w, h) => alive && setNatural({ w, h }), () => undefined);
    return () => { alive = false; };
  }, [uri]);

  const point = parsePosition(position);
  let box: { width: number; height: number; left: number; top: number } | null = null;
  if (natural && frame && natural.w > 0 && natural.h > 0 && frame.w > 0 && frame.h > 0) {
    const scale = Math.max(frame.w / natural.w, frame.h / natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    box = { width: w, height: h, left: -(w - frame.w) * (point.x / 100), top: -(h - frame.h) * (point.y / 100) };
  }

  return (
    <View
      style={[{ overflow: 'hidden' }, style as StyleProp<ViewStyle>]}
      onLayout={e => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Image
        source={{ uri }}
        style={box ? { position: 'absolute', ...box } : { width: '100%', height: '100%' }}
        resizeMode={box ? 'stretch' : 'cover'}
        onError={onError}
      />
    </View>
  );
}
