import { useCallback, useEffect, useState } from 'react';
import api from '@/services/api';
import {
  getActiveVendorId,
  setActiveVendorId,
  subscribeActiveVendorId,
} from '@/services/vendorLocation';

export interface VendorLocation {
  id: string;
  /** Full listing name, e.g. "Mama Put - Rumuola". */
  businessName: string;
  /** Short name for a branch ("Rumuola"); null for the main business. */
  branchLabel: string | null;
  address: string;
  city: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isOpen: boolean;
  isMain: boolean;
}

/** The location the vendor is currently managing (null until the stored choice has loaded). */
export function useActiveVendorId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getActiveVendorId().then((v) => { if (alive) setId(v); });
    const unsub = subscribeActiveVendorId((v) => setId(v));
    return () => { alive = false; unsub(); };
  }, []);
  return id;
}

/**
 * Every location the signed-in vendor owns, plus which one is active. Falls back to the main
 * business if the stored choice no longer exists (for example a branch that was removed).
 */
export function useVendorLocations() {
  const activeId = useActiveVendorId();
  const [locations, setLocations] = useState<VendorLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/vendors/me/branches');
      const { main, branches } = res.data.data as { main: any; branches: any[] };
      const rows: VendorLocation[] = [main, ...branches].map((v, i) => ({
        id: v.id,
        businessName: v.businessName,
        branchLabel: v.branchLabel ?? null,
        address: v.address,
        city: v.city,
        approvalStatus: v.approvalStatus,
        isOpen: v.isOpen,
        isMain: i === 0,
      }));
      setLocations(rows);
      const stored = await getActiveVendorId();
      if (stored && !rows.some((r) => r.id === stored)) await setActiveVendorId(null);
    } catch {
      // Keep whatever we had; a vendor with no branches simply sees one location.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = locations.find((l) => l.id === activeId) ?? locations.find((l) => l.isMain) ?? null;
  const switchTo = useCallback((loc: VendorLocation) => setActiveVendorId(loc.isMain ? null : loc.id), []);

  return { locations, active, loading, refresh, switchTo };
}
