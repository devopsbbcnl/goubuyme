/**
 * HR files are private (NDPA register G34). Contracts, certificates, receipts, CVs and new-hire documents live in the
 * private bucket and are stored in the database as `r2-hr:hr/<owner>/<id>.<ext>` references.
 *
 * This middleware sits on the HR routers (admin PWM, My HR, public careers/pre-boarding) so that no individual
 * endpoint has to remember to handle files:
 *
 *   on the way in:  signed links the page received are turned back into references (so a record that is edited and
 *                   saved again keeps its file), and every reference must be well-formed and the stored file must exist
 *                   and pass the size and type check;
 *   on the way out: every `r2-hr:` reference in a JSON response is replaced by a 15-minute signed link.
 *
 * Who may see a record is still decided by each route's own access rules; this only changes what a file link looks like.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { parseHrReference, hrKeyFromSignedUrl, hrReference, signedViewUrl, isConfigured } from '../services/objectStorage.service';
import { verifyUploads } from '../services/uploadVerification.service';

const HR_REF = 'r2-hr:';

type Json = unknown;

/** Rewrites signed HR links back to references, and returns every reference found. Mutates `value` in place. */
export function normaliseHrBody(value: Json, refs: string[] = [], depth = 0): string[] {
  if (depth > 8 || value === null || typeof value !== 'object') return refs;
  const holder = value as Record<string, Json>;
  for (const k of Object.keys(holder)) {
    const v = holder[k];
    if (typeof v === 'string') {
      const key = hrKeyFromSignedUrl(v);
      if (key) holder[k] = hrReference(key);
      const now = holder[k] as string;
      if (now.startsWith(HR_REF)) refs.push(now);
    } else {
      normaliseHrBody(v, refs, depth + 1);
    }
  }
  return refs;
}

/** Copy of a response body with every HR reference replaced by a short-lived signed link. */
export async function signHrLinks(value: Json, depth = 0): Promise<Json> {
  if (typeof value === 'string') {
    const key = value.startsWith(HR_REF) ? parseHrReference(value) : null;
    return key && isConfigured('kyc') ? signedViewUrl('kyc', key) : value;
  }
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return Promise.all(value.map((v) => signHrLinks(v, depth + 1)));
  const out: Record<string, Json> = {};
  await Promise.all(Object.entries(value as Record<string, Json>).map(async ([k, v]) => { out[k] = await signHrLinks(v, depth + 1); }));
  return out;
}

/** Most files a single request may point at (a new hire's pre-boarding pack is the largest). */
const MAX_FILES_PER_REQUEST = 10;

/**
 * @param opts.publicRoute  true on routes with no login (careers apply, pre-boarding): the stored files are always checked,
 *                          so mount it after the route's own rate limiter. On login-protected routers the check only
 *                          runs when a sign-in header is present, so anonymous callers cannot trigger storage lookups.
 */
export const hrFilesFor = (opts: { publicRoute?: boolean } = {}): RequestHandler => async (req: Request, res: Response, next: NextFunction) => {
  try {
    // In: normalise, then validate.
    if (req.body && typeof req.body === 'object') {
      const refs = normaliseHrBody(req.body);
      for (const r of refs) {
        if (!parseHrReference(r)) return res.status(400).json({ status: 'error', message: 'One of the files was not uploaded correctly. Please upload it again.' });
      }
      if (refs.length > MAX_FILES_PER_REQUEST) return res.status(400).json({ status: 'error', message: 'Too many files in one request.' });
      if (refs.length && (opts.publicRoute || req.headers.authorization)) {
        const bad = await verifyUploads(refs);
        if (bad) return res.status(400).json({ status: 'error', message: bad });
      }
    }

    // Out: swap references for signed links.
    const original = res.json.bind(res);
    res.json = ((body: Json) => {
      let hasRefs = false;
      try { hasRefs = JSON.stringify(body)?.includes(HR_REF) ?? false; } catch { /* circular or unserialisable: leave as is */ }
      if (!hasRefs) return original(body);
      signHrLinks(body).then((signed) => original(signed)).catch(() => original(body));
      return res;
    }) as Response['json'];
    next();
  } catch (err) {
    next(err);
  }
};

/** For the login-protected HR routers (admin PWM and My HR). */
export const hrFiles: RequestHandler = hrFilesFor();
