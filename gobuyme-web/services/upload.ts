'use client';

import api from './api';
import { resizeForUpload } from '@/lib/imageResize';

export type UploadPurpose = 'kyc' | 'avatar' | 'logo' | 'cover' | 'menu' | 'promo';

interface UploadTicket {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  reference: string;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Uploads a photo to GoBuyMe's own storage and returns what to save in the record.
 *
 * The API issues a short-lived signed link for one new file, the photo goes straight to storage, and no storage key
 * ever reaches the browser. `kyc` photos (ID, selfie, certificate, licence) are private and can only be viewed through
 * short-lived links; every other purpose returns a public image address.
 * Photos are shrunk first (never cropped), so storage serves exactly what is uploaded.
 */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<string> {
  const prepared = await resizeForUpload(file);
  const contentType = ALLOWED.includes(prepared.type) ? prepared.type : 'image/jpeg';
  if (!ALLOWED.includes(prepared.type)) throw new Error('Please choose a JPG, PNG or WebP image.');

  let ticket: UploadTicket;
  try {
    const r = await api.post('/uploads/ticket', { purpose, contentType });
    ticket = r.data.data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? 'Could not start the upload. Please try again.');
  }

  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: prepared });
  } catch (err) {
    throw new Error(`Network error while uploading: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (!res.ok) throw new Error(`Image upload failed (HTTP ${res.status}). Please try again.`);

  return ticket.reference;
}
