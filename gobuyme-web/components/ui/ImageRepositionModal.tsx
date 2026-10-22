'use client';

import { useEffect, useRef, useState } from 'react';
import { clamp, formatPosition, parsePosition, type ImagePoint } from '@/lib/imagePosition';

interface Props {
  // A freshly chosen file, or the URL of an image that is already uploaded.
  file?: File | null;
  src?: string | null;
  position?: string | null;   // saved "x% y%", when repositioning an existing image
  aspect?: number;            // width / height of the frame the image is shown in
  round?: boolean;            // preview the frame as a circle (avatars, logos)
  onCancel: () => void;
  // `file` is set only when a new file was chosen: the whole picture, downscaled,
  // never cropped — the position decides what shows.
  onConfirm: (result: { file?: File; position: string }) => void;
}

const FRAME_W = 320;
const KEY_STEP = 2;
const MAX_DIMENSION = 1600;

export default function ImageRepositionModal({
  file, src, position, aspect = 4 / 3, round = false, onCancel, onConfirm,
}: Props) {
  const frameH = FRAME_W / aspect;
  // A blob: URL would be simpler, but the app's CSP img-src only allows
  // 'self' / data: / specific hosts — blob: is blocked, so read as a data URL.
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [point, setPoint] = useState<ImagePoint>(parsePosition(position));
  const grab = useRef<{ startX: number; startY: number; from: ImagePoint } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setNatural(null);
    setPoint(parsePosition(file ? null : position));
    setFileUrl(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFileUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, [file, position]);

  const imgUrl = file ? fileUrl : src ?? null;
  const open = Boolean(file || src);

  // How far the picture overflows the frame, in px, once scaled to cover it. Dragging
  // by that many px moves the crop from one edge to the other, so the picture follows
  // the pointer 1:1.
  const scale = natural ? Math.max(FRAME_W / natural.w, frameH / natural.h) : 1;
  const overflowX = natural ? natural.w * scale - FRAME_W : 0;
  const overflowY = natural ? natural.h * scale - frameH : 0;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    grab.current = { startX: e.clientX, startY: e.clientY, from: point };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const held = grab.current;
    if (!held) return;
    // Dragging right brings the left of the picture into view: the position moves
    // against the pointer.
    setPoint({
      x: overflowX > 0 ? clamp(held.from.x - ((e.clientX - held.startX) / overflowX) * 100) : held.from.x,
      y: overflowY > 0 ? clamp(held.from.y - ((e.clientY - held.startY) / overflowY) * 100) : held.from.y,
    });
  };

  const onPointerUp = () => {
    grab.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP], ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0],
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    setPoint(p => ({ x: clamp(p.x + step[0]), y: clamp(p.y + step[1]) }));
  };

  const confirm = () => {
    const value = formatPosition(point);
    const img = imgRef.current;
    if (!file || !img || !natural) {
      onConfirm({ position: value });
      return;
    }
    // Downscale the whole picture so a 6 MB phone photo uploads quickly.
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(natural.w, natural.h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(natural.w * ratio);
    canvas.height = Math.round(natural.h * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) { onConfirm({ file, position: value }); return; }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) { onConfirm({ file, position: value }); return; }
      const name = file.name.replace(/\.\w+$/, '') + '.jpg';
      onConfirm({ file: new File([blob], name, { type: 'image/jpeg' }), position: value });
    }, 'image/jpeg', 0.88);
  };

  if (!open || !imgUrl) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: FRAME_W + 48 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>Position Image</h3><button onClick={onCancel}>✕</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            role="application"
            aria-label="Drag to choose what the image shows, or use the arrow keys"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            style={{
              width: FRAME_W, height: frameH, overflow: 'hidden', position: 'relative',
              borderRadius: round ? '50%' : 4, border: '2px solid var(--brand)', background: 'var(--surface2)',
              cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt="Position preview"
              onLoad={() => {
                const img = imgRef.current;
                if (img) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              draggable={false}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none',
                objectPosition: formatPosition(point),
              }}
            />
          </div>
          <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
            Drag the image to choose what shows · arrow keys nudge it
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!natural}>
            {file ? 'Use Photo' : 'Save Position'}
          </button>
        </div>
      </div>
    </div>
  );
}
