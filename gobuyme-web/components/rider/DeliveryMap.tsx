'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RiderPosition } from '@/hooks/useRiderLiveLocation';

// MapLibre resolves its worker script from its own bundled `import.meta.url` at
// runtime, but once Turbopack inlines that code into our chunk, `import.meta.url`
// no longer points at the real maplibre-gl-worker.mjs file — it resolves to the
// current page instead, so the browser tries to load a Worker from e.g.
// `/rider/active` (HTML) and rejects it for the wrong MIME type. Point it at a
// verbatim static copy instead (see scripts/copy-maplibre-worker.mjs) — the
// worker's own internal `import "./maplibre-gl-shared.mjs"` only resolves
// correctly when both files are served as plain, co-located static assets.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

// Free, keyless vector tiles — no billing account required (see gobuyme-mobile's
// MapLibre + MapTiler setup for the native equivalent; web has no MapTiler key configured yet).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const ROUTE_SOURCE_ID = 'delivery-route';

interface LatLng { lat: number; lng: number }

function pinEl(emoji: string, background: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '32px';
  el.style.height = '32px';
  el.style.borderRadius = '9999px';
  el.style.background = background;
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.fontSize = '16px';
  el.style.boxShadow = '0 2px 6px rgba(0,0,0,.35)';
  el.style.border = '2px solid #fff';
  el.textContent = emoji;
  return el;
}

export default function DeliveryMap({
  vendor, customer, riderPosition, height = 360,
}: {
  vendor: LatLng & { name: string };
  customer: LatLng & { name: string };
  riderPosition?: RiderPosition | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const riderMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [(vendor.lng + customer.lng) / 2, (vendor.lat + customer.lat) / 2],
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      new maplibregl.Marker({ element: pinEl('🏪', '#FF521B') })
        .setLngLat([vendor.lng, vendor.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(vendor.name))
        .addTo(map);

      new maplibregl.Marker({ element: pinEl('🏠', '#1A9E5F') })
        .setLngLat([customer.lng, customer.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(customer.name))
        .addTo(map);

      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [[vendor.lng, vendor.lat], [customer.lng, customer.lat]],
          },
        },
      });
      map.addLayer({
        id: ROUTE_SOURCE_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: { 'line-color': '#0077FF', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
      });

      const bounds = new maplibregl.LngLatBounds(
        [vendor.lng, vendor.lat],
        [vendor.lng, vendor.lat],
      );
      bounds.extend([customer.lng, customer.lat]);
      map.fitBounds(bounds, { padding: 56, maxZoom: 15 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
    };
    // Only re-init the map when the delivery's endpoints change, not on every rider GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor.lat, vendor.lng, customer.lat, customer.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !riderPosition) return;

    if (!riderMarkerRef.current) {
      riderMarkerRef.current = new maplibregl.Marker({ element: pinEl('🏍️', '#0077FF') })
        .setLngLat([riderPosition.lng, riderPosition.lat])
        .addTo(map);
    } else {
      riderMarkerRef.current.setLngLat([riderPosition.lng, riderPosition.lat]);
    }
  }, [riderPosition]);

  return <div ref={containerRef} style={{ width: '100%', height, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--line)' }} />;
}
