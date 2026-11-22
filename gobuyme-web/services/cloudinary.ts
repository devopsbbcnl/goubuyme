import api from './api';

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

/**
 * Private upload for identity and verification photos (ID, selfie, certificate, licence, vehicle).
 * The API signs the upload, so no public preset is involved and the file is stored privately; the
 * API returns short-lived links when the image is shown back.
 */
export async function uploadKycImage(file: File): Promise<string> {
  let t: { apiKey: string; timestamp: number; signature: string; folder: string; type: string; uploadUrl: string };
  try {
    const r = await api.post('/auth/kyc-upload-ticket', {});
    t = r.data.data;
  } catch (err: any) {
    throw new Error(err?.response?.data?.message ?? 'Could not start the upload. Please try again.');
  }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', t.apiKey);
  fd.append('timestamp', String(t.timestamp));
  fd.append('signature', t.signature);
  fd.append('folder', t.folder);
  fd.append('type', t.type);
  let res: Response;
  try {
    res = await fetch(t.uploadUrl, { method: 'POST', body: fd });
  } catch (err) {
    throw new Error(`Network error while uploading: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  const data = await res.json().catch(() => ({})) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) throw new Error(`Image upload failed: ${data?.error?.message ?? `HTTP ${res.status}`}`);
  return data.secure_url;
}

export async function uploadToCloudinary(file: File, folder = 'uploads'): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', folder);

  let res: Response;
  try {
    res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: fd },
    );
  } catch (err) {
    console.error('[uploadToCloudinary] network error', err);
    throw new Error(`Network error while uploading: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  const data = await res.json().catch(() => ({})) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) {
    const reason = data?.error?.message ?? `HTTP ${res.status}`;
    console.error('[uploadToCloudinary] Cloudinary rejected upload:', reason);
    throw new Error(`Image upload failed: ${reason}`);
  }
  return data.secure_url as string;
}
