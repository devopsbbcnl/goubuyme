import { Prisma } from '@prisma/client';
import prisma from '../config/db';

/**
 * Review-only vendors: a demo store that only the app-store reviewers' accounts may see or order from.
 *
 *   REVIEW_VENDOR_SLUGS   comma-separated vendor slugs that are hidden from everyone else
 *   REVIEWER_EMAILS       comma-separated login emails allowed to see and use them
 *                         (the reviewer customer, plus the demo vendor and rider logins)
 *
 * Unset (the default) means nothing is hidden and nothing changes. Admins are unaffected because
 * the admin routes never use these filters.
 */

const csv = (v?: string): string[] =>
  (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const reviewVendorSlugs = (): string[] => csv(process.env.REVIEW_VENDOR_SLUGS);
export const reviewerEmails = (): string[] => csv(process.env.REVIEWER_EMAILS);

const CACHE_MS = 60_000;
const cache = new Map<string, { value: boolean; at: number }>();

/** True when this logged-in user is one of the reviewer accounts. */
export async function isReviewer(userId?: string): Promise<boolean> {
  if (!userId) return false;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const value = !!user && reviewerEmails().includes(user.email.toLowerCase());
  cache.set(userId, { value, at: Date.now() });
  return value;
}

/**
 * A Prisma `Vendor` where-fragment that removes the review-only vendors for anyone who is not a
 * reviewer: spread it into a vendor filter. Empty (matches everything) when nothing is configured
 * or the viewer is a reviewer.
 */
export async function reviewVendorFilter(viewer?: { userId?: string }): Promise<Prisma.VendorWhereInput> {
  const slugs = reviewVendorSlugs();
  if (!slugs.length) return {};
  if (await isReviewer(viewer?.userId)) return {};
  return { slug: { notIn: slugs } };
}

/** True when `slug` is a review-only vendor this viewer may not use. */
export async function isHiddenFromViewer(slug: string, viewer?: { userId?: string }): Promise<boolean> {
  if (!reviewVendorSlugs().includes(slug.toLowerCase())) return false;
  return !(await isReviewer(viewer?.userId));
}

/** Ids of the review-only vendors (for filters that are not on the Vendor table, like offers). */
export async function reviewVendorIds(): Promise<string[]> {
  const slugs = reviewVendorSlugs();
  if (!slugs.length) return [];
  const rows = await prisma.vendor.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export const __testing = { clearCache: () => cache.clear() };
