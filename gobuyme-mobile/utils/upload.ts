import api from '@/services/api';
import { prepareForUpload } from '@/utils/imageOptimize';

export type UploadPurpose = 'kyc' | 'avatar' | 'logo' | 'cover' | 'menu' | 'promo';

interface UploadTicket {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  reference: string;
}

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Pickers return jpeg for camera and most gallery photos; anything we cannot tell is sent as jpeg. */
function mimeFor(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'image/jpeg';
}

/**
 * Uploads a photo to GoBuyMe's own storage and returns what to save in the record.
 *
 * The API issues a short-lived signed link for one new file; the photo goes straight to storage and no storage
 * key ever lives in the app. `kyc` photos (ID, selfie, certificate, licence) are private; everything else is a
 * public image whose address is returned.
 */
export async function uploadImage(uri: string, purpose: UploadPurpose): Promise<string> {
  // Phone photos are 4000px+ and several MB; shrink them first (never crops). Storage serves what we upload as it is.
  const prepared = await prepareForUpload(uri);
  const contentType = mimeFor(prepared);

  let ticket: UploadTicket;
  try {
    const res = await api.post('/uploads/ticket', { purpose, contentType });
    ticket = res.data.data as UploadTicket;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? 'Could not start the upload. Check your connection and try again.');
  }

  let blob: Blob;
  try {
    blob = await (await fetch(prepared)).blob();
  } catch {
    throw new Error('Could not read that photo. Please choose it again.');
  }

  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: blob });
  } catch (err: any) {
    throw new Error(`Network error while uploading: ${err?.message ?? 'unknown'}`);
  }
  if (!res.ok) throw new Error(`Image upload failed (HTTP ${res.status}). Please try again.`);

  return ticket.reference;
}
