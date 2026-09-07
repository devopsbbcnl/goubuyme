import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

// Number: 0707 890 1075 → international +234 707 890 1075 (wa.me strips the leading 0).
const WHATSAPP_NUMBER = '2347078901075';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi GoBuyMe 👋 I'd like some help.",
)}`;

const SIZE = 56;
const MARGIN = 18;
const TAP_SLOP = 8; // movement under this (px) counts as a tap, not a drag
const STORAGE_KEY = '@gbm/whatsapp_fab_pos';

/**
 * Floating WhatsApp support button, overlaid across the customer screens.
 * Draggable so it can be moved out of the way of content on any screen; it
 * snaps to the nearer left/right edge on release and remembers its position.
 */
export default function WhatsAppFab() {
  const { width, height } = useWindowDimensions();
  const pan = useRef(new Animated.ValueXY()).current;
  const posRef = useRef({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(x, MARGIN), Math.max(width - SIZE - MARGIN, MARGIN)),
    y: Math.min(Math.max(y, MARGIN), Math.max(height - SIZE - MARGIN, MARGIN)),
  });

  const setPos = (x: number, y: number) => {
    posRef.current = { x, y };
    pan.setValue({ x, y });
  };

  const persist = (p: { x: number; y: number }) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p)).catch(() => {});
  };

  // Restore the saved position (or fall back to bottom-right) once the screen
  // size is known. Bottom offset clears the bottom nav on screens that have one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let start = clamp(width - SIZE - MARGIN, height - SIZE - 90);
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            start = clamp(parsed.x, parsed.y);
          }
        }
      } catch {
        /* ignore malformed storage */
      }
      if (!cancelled) {
        setPos(start.x, start.y);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the button on-screen across rotation / split-screen resizes.
  useEffect(() => {
    if (!ready) return;
    const c = clamp(posRef.current.x, posRef.current.y);
    setPos(c.x, c.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        pan.setOffset({ x: posRef.current.x, y: posRef.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        // A near-stationary press is a tap → open the chat.
        if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
          setPos(posRef.current.x, posRef.current.y); // undo any sub-slop drift
          Linking.openURL(WHATSAPP_URL).catch(() => {});
          return;
        }
        const c = clamp(posRef.current.x + g.dx, posRef.current.y + g.dy);
        // Snap to the nearer vertical edge.
        const snappedX =
          c.x + SIZE / 2 < width / 2 ? MARGIN : width - SIZE - MARGIN;
        posRef.current = { x: snappedX, y: c.y };
        Animated.spring(pan, {
          toValue: { x: snappedX, y: c.y },
          useNativeDriver: false,
          friction: 6,
          tension: 60,
        }).start();
        persist(posRef.current);
      },
      onPanResponderTerminate: () => {
        pan.flattenOffset();
        setPos(posRef.current.x, posRef.current.y);
      },
    }),
  ).current;

  if (!ready) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityLabel="Chat with us on WhatsApp"
      accessibilityRole="button"
      accessibilityHint="Activates WhatsApp. Drag to reposition the button."
      style={[styles.fab, { transform: pan.getTranslateTransform() }]}
    >
      <Ionicons name="logo-whatsapp" size={30} color="#fff" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 900,
    elevation: 8,
    shadowColor: '#25D366',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
