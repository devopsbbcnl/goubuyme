import crypto from 'crypto';
import { Prisma, Vendor } from '@prisma/client';
import prisma from '../config/db';

/** Locations a single business may run besides its main address. */
export const MAX_BRANCHES = 10;

export class BranchError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
  }
}

export interface BranchInput {
  name: string;
  address: string;
  city: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  phone?: string | null;
}

type Tx = Prisma.TransactionClient;

const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** "Mama Put" + "Rumuola" -> "Mama Put - Rumuola". The prefix keeps every listing recognisable. */
export const branchBusinessName = (parentName: string, label: string) => `${parentName} - ${label.trim()}`;

/**
 * Create a branch as its own vendor: it gets its own menu, stock, hours, approval, ratings and
 * public listing, but is owned by the same account so one login manages it.
 *
 * It starts from a copy of the main business (look, category, tier, opening hours) so the listing
 * is presentable straight away; menu and stock are NOT shared, see `copyMenu`. Its approval status
 * mirrors the main business (kept in sync when an admin changes it, see `syncBranchesWithParent`).
 */
export async function createBranchVendor(tx: Tx, parent: Vendor, input: BranchInput): Promise<Vendor> {
  if (parent.parentVendorId) throw new BranchError('A branch cannot have branches of its own.');

  const label = input.name.trim();
  const businessName = branchBusinessName(parent.businessName, label);

  const existing = await tx.vendor.count({ where: { parentVendorId: parent.id } });
  if (existing >= MAX_BRANCHES) throw new BranchError(`You can add up to ${MAX_BRANCHES} branches.`, 409);

  const clash = await tx.vendor.findFirst({
    where: { businessName: { equals: businessName, mode: 'insensitive' } },
    select: { id: true },
  });
  if (clash) throw new BranchError(`You already have a location called "${label}". Choose a different name.`, 409);

  const branch = await tx.vendor.create({
    data: {
      userId: parent.userId,
      parentVendorId: parent.id,
      branchLabel: label,
      businessName,
      slug: `${slugify(businessName)}-${crypto.randomUUID().slice(0, 6)}`,
      contactPhone: input.phone?.trim() || null,
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state?.trim() || parent.state,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      // Presentable from day one; the owner edits these per branch afterwards.
      category: parent.category,
      subcategory: parent.subcategory,
      description: parent.description,
      logo: parent.logo,
      logoPosition: parent.logoPosition,
      coverImage: parent.coverImage,
      coverPosition: parent.coverPosition,
      timezone: parent.timezone,
      openingTime: parent.openingTime,
      closingTime: parent.closingTime,
      avgDeliveryTime: parent.avgDeliveryTime,
      commissionTier: parent.commissionTier,
      isPharmacyFlagged: parent.isPharmacyFlagged,
      approvalStatus: parent.approvalStatus,
      isOpen: false,
    },
  });

  const hours = await tx.vendorBusinessHours.findMany({
    where: { vendorId: parent.id },
    select: { dayOfWeek: true, openTime: true, closeTime: true },
  });
  if (hours.length) {
    await tx.vendorBusinessHours.createMany({ data: hours.map((h) => ({ ...h, vendorId: branch.id })) });
  }

  return branch;
}

/**
 * One-off copy of the main menu into a branch, as a starting point. Everything is copied
 * (prices, photos, extras and options) but stock starts at zero: stock is per location, so each
 * branch must say what it actually has before customers can order it.
 */
export async function copyMenu(tx: Tx, fromVendorId: string, toVendorId: string): Promise<number> {
  const items = await tx.menuItem.findMany({
    where: { vendorId: fromVendorId },
    include: { drinkOptions: true, optionGroups: { include: { items: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const item of items) {
    await tx.menuItem.create({
      data: {
        vendorId: toVendorId,
        name: item.name,
        description: item.description,
        price: item.price,
        image: item.image,
        imagePosition: item.imagePosition,
        category: item.category,
        isAvailable: item.isAvailable,
        isFeatured: item.isFeatured,
        stockQuantity: 0,
        drinkOptions: {
          create: item.drinkOptions.map((d) => ({ name: d.name, price: d.price, isAvailable: d.isAvailable })),
        },
        optionGroups: {
          create: item.optionGroups.map((g) => ({
            name: g.name,
            required: g.required,
            items: { create: g.items.map((o) => ({ name: o.name, extraPrice: o.extraPrice, isAvailable: o.isAvailable })) },
          })),
        },
      },
    });
  }
  return items.length;
}

/**
 * Keep branches in step with the main business for the things only an admin or the owner's plan
 * decides: approval status and commission tier. Public queries filter on each vendor row's own
 * status, so this is what hides a suspended business's branches from customers.
 */
export async function syncBranchesWithParent(
  parentId: string,
  patch: { approvalStatus?: Vendor['approvalStatus']; commissionTier?: Vendor['commissionTier'] },
): Promise<void> {
  const data: Prisma.VendorUpdateManyMutationInput = {};
  if (patch.approvalStatus) data.approvalStatus = patch.approvalStatus;
  if (patch.commissionTier) data.commissionTier = patch.commissionTier;
  if (Object.keys(data).length === 0) return;
  // A suspended/rejected business must not keep trading through its branches.
  if (patch.approvalStatus && patch.approvalStatus !== 'APPROVED') data.isOpen = false;
  await prisma.vendor.updateMany({ where: { parentVendorId: parentId }, data });
}
