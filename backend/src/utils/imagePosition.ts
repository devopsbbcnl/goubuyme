// Where an image's crop sits inside its frame, as a CSS object-position pair
// ("50% 30%"). Null means centred. Owners drag the image into place after upload.
const POSITION_RE = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;

export function isValidImagePosition(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = POSITION_RE.exec(value);
  return Boolean(match) && Number(match![1]) <= 100 && Number(match![2]) <= 100;
}

// undefined = field not sent (leave alone), null = reset to centred, string = valid pair.
// Returns false when the value is present but malformed.
export function parseImagePosition(value: unknown): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return isValidImagePosition(value) ? value : false;
}

// What to store for an image field being written. An explicit position wins; otherwise a
// different picture is cropped differently, so it starts centred; the same URL sent again
// (forms resend every field on save) keeps whatever position it had.
export function nextImagePosition(
  position: string | null | undefined,
  nextUrl: string | null | undefined,
  currentUrl: string | null | undefined,
): { set: true; value: string | null } | { set: false } {
  if (position !== undefined) return { set: true, value: position };
  if (nextUrl !== undefined && (nextUrl || null) !== (currentUrl ?? null)) return { set: true, value: null };
  return { set: false };
}
