'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  file: File | null;
  aspect?: number;        // width / height of the crop frame
  outputWidth?: number;   // px
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

const FRAME_W = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export default function ImageCropModal({ file, aspect = 4 / 3, outputWidth = 1080, onCancel, onConfirm }: Props) {
  const frameH = FRAME_W / aspect;
  // A blob: URL would be simpler, but the app's CSP img-src only allows
  // 'self' / data: / specific hosts — blob: is blocked, so read as a data URL.
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  useEffect(() => {
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImgUrl(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImgUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, [file]);

  const baseScale = natural ? Math.max(FRAME_W / natural.w, frameH / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : 0;
  const dispH = natural ? natural.h * scale : 0;

  const clamp = (off: { x: number; y: number }, w: number, h: number) => ({
    x: Math.min(0, Math.max(off.x, FRAME_W - w)),
    y: Math.min(0, Math.max(off.y, frameH - h)),
  });

  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  };

  useEffect(() => {
    if (!natural) return;
    setOffset(prev => clamp(prev, dispW, dispH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.startOffX + dx, y: dragRef.current.startOffY + dy }, dispW, dispH));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sw = FRAME_W / scale;
    const sh = frameH / scale;

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth / aspect);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      const name = (file?.name ?? 'image').replace(/\.\w+$/, '') + '.jpg';
      onConfirm(new File([blob], name, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  if (!file || !imgUrl) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onCancel}>
      <div className="modal" style={{ maxWidth: FRAME_W + 48 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>Adjust Image</h3><button onClick={onCancel}>✕</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
            style={{
              width: FRAME_W, height: frameH, overflow: 'hidden', position: 'relative',
              borderRadius: 4, border: '1.5px solid var(--line)', background: 'var(--surface2)',
              cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt="Crop preview"
              onLoad={onLoad}
              draggable={false}
              style={{
                position: 'absolute', left: offset.x, top: offset.y,
                width: dispW || undefined, height: dispH || undefined,
                maxWidth: 'none', pointerEvents: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
          <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>Drag to reposition · scroll or use the slider to zoom</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!natural}>Use Photo</button>
        </div>
      </div>
    </div>
  );
}
