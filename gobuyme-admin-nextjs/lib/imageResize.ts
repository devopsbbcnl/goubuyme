// Longest side we keep for uploads. Phone/camera photos are 4000px+ (several MB); nothing on the
// site shows a picture bigger than this, and smaller uploads are much faster on mobile data.
const MAX_UPLOAD_SIDE = 1600;
const UPLOAD_QUALITY = 0.85;

/**
 * Downscales a photo to MAX_UPLOAD_SIDE and re-encodes it (WebP where the browser can, else JPEG).
 * Never crops. Returns the original file untouched when it is already small, isn't a photo format
 * worth re-encoding (GIF/SVG), or anything fails — an upload is never blocked by this.
 */
export async function resizeForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    // Already small enough: keep the original bytes unless they're unusually heavy.
    if (longest <= MAX_UPLOAD_SIDE && file.size <= 800 * 1024) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, MAX_UPLOAD_SIDE / longest);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const toBlob = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, UPLOAD_QUALITY));
    let blob = await toBlob('image/webp');
    let ext = 'webp';
    // Browsers without WebP encoding silently hand back PNG; fall back to JPEG in that case.
    if (!blob || blob.type !== 'image/webp') { blob = await toBlob('image/jpeg'); ext = 'jpg'; }
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}
