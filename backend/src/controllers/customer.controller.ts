import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';

const getCustomerId = async (userId: string) => {
  const c = await prisma.customer.findUnique({ where: { userId }, select: { id: true } });
  return c?.id;
};

// ─── Cart ─────────────────────────────────────────────────────────────────────

export const getCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const cart = await prisma.cart.findUnique({
    where: { customerId },
    include: {
      items: {
        include: {
          menuItem: {
            select: { id: true, name: true, price: true, image: true, isAvailable: true, vendorId: true },
          },
        },
      },
    },
  });

  return apiResponse.success(res, 'Cart fetched.', cart ?? { items: [], vendorId: null });
});

export const addToCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const { menuItemId, quantity = 1, note, unitPrice } = req.body;

  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { id: true, vendorId: true, isAvailable: true },
  });
  if (!menuItem || !menuItem.isAvailable) return apiResponse.error(res, 'Item not available.', 400);

  const cart = await prisma.cart.upsert({
    where: { customerId },
    update: {},
    create: { customerId, vendorId: menuItem.vendorId },
  });

  if (cart.vendorId && cart.vendorId !== menuItem.vendorId) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.update({ where: { id: cart.id }, data: { vendorId: menuItem.vendorId } });
  }

  const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, menuItemId } });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity, ...(unitPrice != null ? { unitPrice } : {}) },
    });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId, quantity, note, unitPrice } });
  }

  return apiResponse.success(res, 'Item added to cart.');
});

export const updateCartItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const { quantity } = req.body;
  const { itemId } = req.params;

  if (quantity <= 0) {
    await prisma.cartItem.deleteMany({ where: { id: itemId, cart: { customerId } } });
    return apiResponse.success(res, 'Item removed.');
  }

  await prisma.cartItem.updateMany({
    where: { id: itemId, cart: { customerId } },
    data: { quantity },
  });
  return apiResponse.success(res, 'Cart updated.');
});

export const removeCartItem = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  await prisma.cartItem.deleteMany({ where: { id: req.params.itemId, cart: { customerId } } });
  return apiResponse.success(res, 'Item removed.');
});

export const clearCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  await prisma.cartItem.deleteMany({ where: { cart: { customerId } } });
  return apiResponse.success(res, 'Cart cleared.');
});

// ─── Addresses ────────────────────────────────────────────────────────────────

export const getAddresses = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const addresses = await prisma.address.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return apiResponse.success(res, 'Addresses fetched.', addresses);
});

export const addAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const { label, address, city, state, latitude, longitude, isDefault } = req.body;

  if (isDefault) {
    await prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } });
  }

  const newAddress = await prisma.address.create({
    data: {
      customerId, label, address, city,
      state: state || 'Rivers',
      latitude, longitude, isDefault: !!isDefault,
    },
  });
  return apiResponse.success(res, 'Address added.', newAddress, 201);
});

export const updateAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const { isDefault, ...rest } = req.body;
  if (isDefault) {
    await prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } });
  }

  const updated = await prisma.address.updateMany({
    where: { id: req.params.id, customerId },
    data: { ...rest, ...(isDefault !== undefined && { isDefault }) },
  });

  if (!updated.count) return apiResponse.error(res, 'Address not found.', 404);
  return apiResponse.success(res, 'Address updated.');
});

export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  await prisma.address.deleteMany({ where: { id: req.params.id, customerId } });
  return apiResponse.success(res, 'Address deleted.');
});

// ─── Orders (read-only) ───────────────────────────────────────────────────────

export const getOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const { page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: { customerId },
      select: {
        id: true, orderNumber: true, status: true, totalAmount: true,
        paymentMethod: true, createdAt: true,
        vendor: { select: { businessName: true, logo: true } },
        items: { select: { name: true, quantity: true }, take: 2 },
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.order.count({ where: { customerId } }),
  ]);

  return apiResponse.paginated(res, 'Orders fetched.', orders, {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

export const getOrderById = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, customerId },
    include: {
      items: { include: { menuItem: { select: { image: true } } } },
      vendor: { select: { businessName: true, logo: true, address: true } },
      rider: { include: { user: { select: { name: true, avatar: true, phone: true } } } },
    },
  });
  if (!order) return apiResponse.error(res, 'Order not found.', 404);
  return apiResponse.success(res, 'Order fetched.', order);
});

// ─── Favourites ───────────────────────────────────────────────────────────────

export const getFavorites = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const favorites = await prisma.favorite.findMany({
    where: { customerId },
    include: {
      vendor: { select: { id: true, businessName: true, logo: true, category: true, rating: true, isOpen: true } },
    },
  });
  return apiResponse.success(res, 'Favorites fetched.', favorites.map((f) => f.vendor));
});

export const toggleFavorite = catchAsync(async (req: AuthRequest, res: Response) => {
  const customerId = await getCustomerId(req.user!.userId);
  if (!customerId) return apiResponse.error(res, 'Customer not found.', 404);

  const { vendorId } = req.params;
  const existing = await prisma.favorite.findUnique({
    where: { customerId_vendorId: { customerId, vendorId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return apiResponse.success(res, 'Removed from favorites.');
  }
  await prisma.favorite.create({ data: { customerId, vendorId } });
  return apiResponse.success(res, 'Added to favorites.', null, 201);
});

// ─── Referral ────────────────────────────────────────────────────────────────

export const getReferral = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { referralCode: true, freeDeliveryCredits: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);

  const activeReferrals = await prisma.referral.count({
    where: { referrerId: req.user!.userId, isActive: true },
  });

  return apiResponse.success(res, 'Referral data fetched.', {
    code: user.referralCode,
    credits: user.freeDeliveryCredits,
    activeReferrals,
    nextCreditAt: 10 - (activeReferrals % 10),
  });
});
