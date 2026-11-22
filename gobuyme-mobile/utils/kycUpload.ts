import api from '@/services/api';

interface UploadTicket {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  type: string;
  uploadUrl: string;
}

/**
 * Uploads an identity or verification photo (ID, selfie, certificate, licence) privately.
 *
 * The server signs the upload, so there is no public upload preset in the app, and the image is stored
 * as a private file that only the owner and GoBuyMe staff can open (through short-lived links).
 * Returns the URL to send back to the API when submitting the form.
 */
export async function uploadKycImage(uri: string): Promise<string> {
  let ticket: UploadTicket;
  try {
    const res = await api.post('/auth/kyc-upload-ticket');
    ticket = res.data.data as UploadTicket;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? 'Could not start the upload. Check your connection and try again.');
  }

  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as any);
  form.append('api_key', ticket.apiKey);
  form.append('timestamp', String(ticket.timestamp));
  form.append('signature', ticket.signature);
  form.append('folder', ticket.folder);
  form.append('type', ticket.type);

  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, { method: 'POST', body: form });
  } catch (err: any) {
    throw new Error(`Network error while uploading: ${err?.message ?? 'unknown'}`);
  }
  const data = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) {
    throw new Error(`Image upload failed: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return data.secure_url;
}
