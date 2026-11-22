import { resizeForUpload } from '@/lib/imageResize';

export type UploadPurpose = 'kyc' | 'avatar' | 'logo' | 'cover' | 'menu' | 'promo' | 'media';

export interface UploadTicket {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  reference: string;
}

export type TicketFetcher = (purpose: UploadPurpose, contentType: string) => Promise<UploadTicket>;

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Asks the API (through the signed-in session) for an upload ticket. */
const sessionTicket: TicketFetcher = async (purpose, contentType) => {
  const res = await fetch('/api/proxy/uploads/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose, contentType }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: UploadTicket; message?: string };
  if (!res.ok || !json.data) throw new Error(json.message ?? 'Could not start the upload.');
  return json.data;
};

/**
 * Uploads a photo to GoBuyMe's own storage and returns what to save in the record.
 * The API signs a short-lived link for one new file; the photo then goes straight to storage and no storage key
 * ever reaches the browser. `kyc` photos are private (viewed only through short-lived links); other purposes return
 * a public image address. Photos are shrunk first and never cropped.
 * `fetchTicket` lets pages that hold their own token (the setup pages) ask for the ticket themselves.
 */
export async function uploadImage(file: File, purpose: UploadPurpose, fetchTicket: TicketFetcher = sessionTicket): Promise<string> {
  const prepared = await resizeForUpload(file);
  if (!ALLOWED.includes(prepared.type)) throw new Error('Please choose a JPG, PNG or WebP image.');

  const ticket = await fetchTicket(purpose, prepared.type);

  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: prepared });
  } catch {
    throw new Error('Network error while uploading the image.');
  }
  if (!res.ok) throw new Error(`Image upload failed (HTTP ${res.status}). Please try again.`);
  return ticket.reference;
}
