const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

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
