const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

interface KycTicket { apiKey: string; timestamp: number; signature: string; folder: string; type: string; uploadUrl: string }

/**
 * Private upload for identity and verification photos (ID, selfie, certificate, licence).
 * The backend signs the upload, so no public upload preset is used and the file is stored privately;
 * staff and owners see it only through short-lived links the API returns.
 * `fetchTicket` lets pages that hold their own token (setup pages) supply the request.
 */
export async function kycUpload(
  file: File,
  fetchTicket: () => Promise<KycTicket> = async () => {
    const res = await fetch('/api/proxy/auth/kyc-upload-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = (await res.json().catch(() => ({}))) as { data?: KycTicket; message?: string };
    if (!res.ok || !json.data) throw new Error(json.message ?? 'Could not start the upload.');
    return json.data;
  },
): Promise<string> {
  const t = await fetchTicket();
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', t.apiKey);
  form.append('timestamp', String(t.timestamp));
  form.append('signature', t.signature);
  form.append('folder', t.folder);
  form.append('type', t.type);
  let res: Response;
  try {
    res = await fetch(t.uploadUrl, { method: 'POST', body: form });
  } catch {
    throw new Error('Network error while uploading the image.');
  }
  const data = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) throw new Error(`Image upload failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
  return data.secure_url;
}

/** Unsigned Cloudinary upload (public images only: logos, menu photos, marketing media). Throws an Error whose message says why it failed. */
export async function cloudinaryUpload(file: File): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Image uploads are not configured on this site (missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET).');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  } catch {
    throw new Error('Network error while uploading the image.');
  }
  const data = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) throw new Error(`Image upload failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
  return data.secure_url;
}
