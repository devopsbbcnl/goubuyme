'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Same worker-url + style setup as components/rider/DeliveryMap.tsx — free, keyless
// vector tiles, no MapTiler account needed on the web side.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Central-Nigeria fallback (matches gobuyme-mobile's LocationPickerModal default).
const DEFAULT_CENTER: [number, number] = [7.0348, 5.4836];

interface Props {
  open: boolean;
  initial?: { lat: number; lng: number } | null;
  onCancel: () => void;
  onConfirm: (result: { lat: number; lng: number }) => void;
}

// Fallback for when text geocoding can't resolve an address (common for Nigerian
// landmark-style addresses with no house number). The pin stays fixed at the center of
// the map container and the map pans underneath it; whatever it's centered on when the
// user confirms is the coordinate that gets saved.
export default function LocationPickerModal({ open, initial, onCancel, onConfirm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [center, setCenter] = useState<[number, number]>([
    initial?.lng ?? DEFAULT_CENTER[0],
    initial?.lat ?? DEFAULT_CENTER[1],
  ]);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center,
      zoom: 15,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('moveend', () => {
      const c = map.getCenter();
      setCenter([c.lng, c.lat]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Re-init fresh each time the modal opens; center drift while open is tracked via moveend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const recenterToMe = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setCenter(next);
        mapRef.current?.flyTo({ center: next, zoom: 16 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{ width: 'min(560px, 92vw)', padding: 0, overflow: 'hidden' }}>
        <div className="modal-head" style={{ padding: 16 }}>
          <h3>Pick Your Location</h3>
          <button onClick={onCancel} className="icon-btn" style={{ color: 'var(--muted)' }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ position: 'relative', height: 380 }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -100%)', pointerEvents: 'none', fontSize: 34, zIndex: 5,
          }}>
            📍
          </div>
          <button
            onClick={recenterToMe}
            disabled={locating}
            className="btn btn-ghost btn-sm"
            style={{ position: 'absolute', right: 12, bottom: 12, background: 'var(--surface)' }}
          >
            {locating ? 'Locating…' : '📍 Use my location'}
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12, padding: '10px 16px 0' }}>
          Drag the map so the pin sits on your delivery location.
        </p>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm({ lat: center[1], lng: center[0] })}>
            Use This Location
          </button>
        </div>
      </div>
    </div>
  );
}
