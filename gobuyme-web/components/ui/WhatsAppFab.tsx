'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Floating WhatsApp support button, shown app-wide via the shop layout.
// Number: 0707 890 1075 → international +234 707 890 1075 (wa.me strips the leading 0).
const WHATSAPP_NUMBER = '2347078901075';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi GoBuyMe 👋 I'd like some help.",
)}`;

const SIZE = 56;
const MARGIN = 16;
const DRAG_THRESHOLD = 6; // px of movement before a press counts as a drag, not a tap
const STORAGE_KEY = 'gbm.whatsappFab.pos';

type Pos = { x: number; y: number };

function clampToViewport({ x, y }: Pos): Pos {
  const maxX = Math.max(window.innerWidth - SIZE - MARGIN, MARGIN);
  const maxY = Math.max(window.innerHeight - SIZE - MARGIN, MARGIN);
  return {
    x: Math.min(Math.max(x, MARGIN), maxX),
    y: Math.min(Math.max(y, MARGIN), maxY),
  };
}

// Bottom-right resting spot; bottom offset clears the mobile bottom nav / cart bar.
function defaultPos(): Pos {
  return clampToViewport({
    x: window.innerWidth - SIZE - 20,
    y: window.innerHeight - SIZE - 84,
  });
}

export function WhatsAppFab() {
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos>({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  // Set while the last press ended up being a drag, so the click handler can
  // suppress the navigation that would otherwise open WhatsApp.
  const movedRef = useRef(false);

  const applyPos = useCallback((next: Pos) => {
    posRef.current = next;
    setPos(next);
  }, []);

  // Restore the saved position (or fall back to the default) once mounted, and
  // keep the button on-screen when the viewport is resized.
  useEffect(() => {
    let initial = defaultPos();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Pos;
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          initial = clampToViewport(parsed);
        }
      }
    } catch {
      /* ignore malformed storage */
    }
    applyPos(initial);

    const onResize = () => applyPos(clampToViewport(posRef.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyPos]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: posRef.current.x,
        originY: posRef.current.y,
        moved: false,
      };
      movedRef.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      movedRef.current = true;
      applyPos(clampToViewport({ x: drag.originX + dx, y: drag.originY + dy }));
    },
    [applyPos],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      if (!drag.moved) return;
      // Snap to whichever vertical edge is nearer, keep the vertical position.
      const mid = posRef.current.x + SIZE / 2;
      const snappedX =
        mid < window.innerWidth / 2
          ? MARGIN
          : window.innerWidth - SIZE - MARGIN;
      const next = clampToViewport({ x: snappedX, y: posRef.current.y });
      applyPos(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — position just won't persist */
      }
    },
    [applyPos],
  );

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (movedRef.current) {
      e.preventDefault();
      movedRef.current = false;
    }
  }, []);

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      draggable={false}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={handleClick}
      style={{
        position: 'fixed',
        left: pos ? pos.x : undefined,
        top: pos ? pos.y : undefined,
        right: pos ? undefined : 20,
        bottom: pos ? undefined : 84,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 900,
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        background: '#25D366',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 20px rgba(37, 211, 102, 0.45)',
        color: '#fff',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        style={{ pointerEvents: 'none' }}
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
}
