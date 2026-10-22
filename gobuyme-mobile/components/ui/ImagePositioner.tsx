import React, { useEffect, useRef, useState } from 'react';
import {
  Image, Modal, PanResponder, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Point, clamp, formatPosition, parsePosition } from '@/utils/imagePosition';

interface Request {
  uri: string;
  aspect: number;          // width / height of the frame the image is shown in
  round?: boolean;
  position?: string | null;
}

interface Props extends Request {
  onCancel: () => void;
  onConfirm: (position: string) => void;
}

function RepositionModal({ uri, aspect, round, position, onCancel, onConfirm }: Props) {
  const { theme: T } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const frameW = Math.min(screenW - 48, 320);
  const frameH = frameW / aspect;

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [point, setPoint] = useState<Point>(parsePosition(position));

  useEffect(() => {
    let alive = true;
    Image.getSize(uri, (w, h) => alive && setNatural({ w, h }), () => undefined);
    return () => { alive = false; };
  }, [uri]);

  // How far the picture overflows the frame once scaled to cover it. Dragging by that
  // many px moves the crop from one edge to the other, so the picture follows the finger 1:1.
  const scale = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const dispW = natural ? natural.w * scale : frameW;
  const dispH = natural ? natural.h * scale : frameH;
  const overflowX = dispW - frameW;
  const overflowY = dispH - frameH;

  const live = useRef({ point, overflowX, overflowY });
  live.current.overflowX = overflowX;
  live.current.overflowY = overflowY;
  live.current.point = point;
  const from = useRef<Point>(point);

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { from.current = live.current.point; },
      onPanResponderMove: (_e, g) => {
        const { overflowX: ox, overflowY: oy } = live.current;
        // Dragging right brings the left of the picture into view: the position moves
        // against the finger.
        setPoint({
          x: ox > 0 ? clamp(from.current.x - (g.dx / ox) * 100) : from.current.x,
          y: oy > 0 ? clamp(from.current.y - (g.dy / oy) * 100) : from.current.y,
        });
      },
    }),
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.title, { color: T.text }]}>Position image</Text>
          <View
            {...pan.panHandlers}
            style={{
              width: frameW, height: frameH, overflow: 'hidden', backgroundColor: T.surface2,
              borderRadius: round ? frameH / 2 : 4,
            }}
          >
            <Image
              source={{ uri }}
              resizeMode="stretch"
              style={{
                position: 'absolute', width: dispW, height: dispH,
                left: -overflowX * (point.x / 100), top: -overflowY * (point.y / 100),
              }}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: T.primary, borderRadius: round ? frameH / 2 : 4 }]}
            />
          </View>
          <Text style={[styles.hint, { color: T.textSec }]}>Drag the image to choose what shows</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { borderColor: T.border }]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={[styles.btnText, { color: T.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: natural ? T.primary : T.surface3, borderColor: 'transparent' }]}
              disabled={!natural}
              onPress={() => onConfirm(formatPosition(point))}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>Use position</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Resolves with the chosen "x% y%", or null when cancelled. Render `element` in the screen.
//   const positioner = useImagePositioner();
//   const position = await positioner.open({ uri, aspect: 1, round: true });
export function useImagePositioner() {
  const [req, setReq] = useState<(Request & { resolve: (p: string | null) => void }) | null>(null);

  const open = (request: Request) =>
    new Promise<string | null>(resolve => setReq({ ...request, resolve }));

  const close = (value: string | null) => {
    req?.resolve(value);
    setReq(null);
  };

  const element = req ? (
    <RepositionModal {...req} onCancel={() => close(null)} onConfirm={p => close(p)} />
  ) : null;

  return { open, element };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 4, borderWidth: 1, padding: 20, alignItems: 'center', gap: 14 },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
  hint: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  btn: { flex: 1, height: 44, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});
