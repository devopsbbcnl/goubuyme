import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * GET /admin/vendors/:id/menu?search=&category=&stock=all|available|out|low
 *
 * The complete menu of one location, with every field staff might need: pricing, stock,
 * availability, photos, drink options and option groups with their choices. Menus are per location
 * (a branch has its own), so this is always the menu of exactly the vendor id asked for.
 */
export const getAdminVendorMenu = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { search, category, stock = 'all' } = req.query as Record<string, string>;

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, businessName: true, parentVendorId: true, branchLabel: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);

  const LOW_STOCK = 5;
  const where: Prisma.MenuItemWhereInput = { vendorId: id };
  if (search?.trim()) {
    where.OR = [
      { name: { contains: search.trim(), mode: 'insensitive' } },
      { description: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }
  if (category?.trim()) where.category = category.trim();
  if (stock === 'available') {
    where.isAvailable = true;
    where.stockQuantity = { gt: 0 };
  } else if (stock === 'out') {
    where.stockQuantity = { lte: 0 };
  } else if (stock === 'low') {
    where.stockQuantity = { gt: 0, lte: LOW_STOCK };
  }

  const [items, categories, totals] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, description: true, price: true,
        image: true, imagePosition: true, category: true,
        isAvailable: true, isFeatured: true, stockQuantity: true,
        createdAt: true, updatedAt: true,
        drinkOptions: {
          select: { id: true, name: true, price: true, isAvailable: true },
          orderBy: { price: 'asc' },
        },
        optionGroups: {
          select: {
            id: true, name: true, required: true,
            items: { select: { id: true, name: true, extraPrice: true, isAvailable: true }, orderBy: { name: 'asc' } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { orderItems: true } },
      },
    }),
    prisma.menuItem.findMany({
      where: { vendorId: id, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    }),
    prisma.menuItem.aggregate({ where: { vendorId: id }, _count: { _all: true }, _sum: { stockQuantity: true } }),
  ]);

  const [available, outOfStock, lowStock] = await Promise.all([
    prisma.menuItem.count({ where: { vendorId: id, isAvailable: true, stockQuantity: { gt: 0 } } }),
    prisma.menuItem.count({ where: { vendorId: id, stockQuantity: { lte: 0 } } }),
    prisma.menuItem.count({ where: { vendorId: id, stockQuantity: { gt: 0, lte: LOW_STOCK } } }),
  ]);

  return apiResponse.success(res, 'Menu fetched.', {
    vendor,
    summary: {
      total: totals._count._all,
      available,
      outOfStock,
      lowStock,
      lowStockThreshold: LOW_STOCK,
      totalStockUnits: totals._sum.stockQuantity ?? 0,
    },
    categories: categories.map((c) => c.category as string),
    items: items.map(({ _count, ...item }) => ({ ...item, timesOrdered: _count.orderItems })),
  });
});
