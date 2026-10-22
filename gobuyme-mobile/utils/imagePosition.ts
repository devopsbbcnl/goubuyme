// Where an image's crop sits inside its frame, as a CSS-style "x% y%" pair the owner
// drags into place after picking a photo. Absent is centred. Mirrors gobuyme-web's
// lib/imagePosition.ts and the backend's utils/imagePosition.ts.

export type Point = { x: number; y: number };

export const CENTRED: Point = { x: 50, y: 50 };

export function clamp(n: number) {
  return Math.min(100, Math.max(0, n));
}

export function parsePosition(value?: string | null): Point {
  const match = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/.exec(value ?? '');
  if (!match) return CENTRED;
  return { x: clamp(Number(match[1])), y: clamp(Number(match[2])) };
}

export function formatPosition(point: Point) {
  return `${Math.round(point.x)}% ${Math.round(point.y)}%`;
}
