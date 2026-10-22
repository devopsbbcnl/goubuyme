// Where an image's crop sits inside its frame: a CSS object-position pair ("50% 30%")
// the owner drags into place after uploading. Null/absent is centred.

export type ImagePoint = { x: number; y: number };

export const CENTRED: ImagePoint = { x: 50, y: 50 };

export function clamp(n: number) {
  return Math.min(100, Math.max(0, n));
}

export function parsePosition(value?: string | null): ImagePoint {
  const match = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/.exec(value ?? '');
  if (!match) return CENTRED;
  return { x: clamp(Number(match[1])), y: clamp(Number(match[2])) };
}

export function formatPosition(point: ImagePoint) {
  return `${Math.round(point.x)}% ${Math.round(point.y)}%`;
}

// Style for an object-fit: cover image; undefined keeps the browser default (centred).
export function positionStyle(value?: string | null): { objectPosition: string } | undefined {
  return value ? { objectPosition: value } : undefined;
}
