import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { calculateDeliveryFee } from '../services/pricing.service';
import { calcVendorFee } from '../services/commission.service';
import { applyFreeDelivery } from '../services/referral.service';
import { getPlatformSettings } from '../services/settings.service';
import { getIO } from '../config/socket';
import { notifyUser } from '../services/notification.service';
import { PaymentMethod, OrderStatus } from '@prisma/client';

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `GBM-${date}-${rand}`;
};

export const estimateDeliveryFee = catchAsync(async (req: AuthRequest, res: Response) => {
  const { addressId, vendorId } = req.query as { addressId?: string; vendorId?: string };
  if (!addressId) return apiResponse.error(res, 'addressId is required.', 400);

  console.log('[estimateDeliveryFee] Request:', { userId: req.user?.userId, addressId, vendorId });

  const customer = await prisma.customer.findUnique({
    where: { userId: req.user!.userId },
    include: { 
      cart: {
        include: {
          items: {
            include: {
              menuItem: {
                select: { vendorId: true }
              }
            }
          }
        }
      }
    },
  });
  if (!customer) {
    console.log('[estimateDeliveryFee] Customer not found for userId:', req.user?.userId);
    return apiResponse.error(res, 'Customer not found.', 404);
  }

  console.log('[estimateDeliveryFee] Customer found:', { customerId: customer.id, cartVendorId: customer.cart?.vendorId, cartId: customer.cart?.id, cartItemsCount: customer.cart?.items?.length });

  const deliveryAddress = await prisma.address.findFirst({
    where: { id: addressId, customerId: customer.id },
  });
  if (!deliveryAddress) {
    console.log('[estimateDeliveryFee] Address not found:', { addressId, customerId: customer.id });
    return apiResponse.error(res, 'Address not found.', 404);
  }

  if (!deliveryAddress.latitude || !deliveryAddress.longitude) {
    console.log('[estimateDeliveryFee] Address coordinates missing:', { addressId });
    return apiResponse.error(res, 'Address coordinates missing.', 400);
  }

  let finalVendorId = vendorId || customer.cart?.vendorId;
  console.log('[estimateDeliveryFee] Initial vendorId:', finalVendorId);
  
  // If no vendorId provided and cart doesn't have vendorId, get it from the first cart item's menu item
  if (!finalVendorId && customer.cart?.items && customer.cart.items.length > 0) {
    console.log('[estimateDeliveryFee] Getting vendorId from cart items:', { itemCount: customer.cart.items.length });
    finalVendorId = customer.cart.items[0].menuItem.vendorId;
    console.log('[estimateDeliveryFee] VendorId from cart item:', finalVendorId);
    // Update the cart with the vendorId for future requests
    if (finalVendorId) {
      await prisma.cart.update({
        where: { id: customer.cart.id },
        data: { vendorId: finalVendorId }
      });
    }
  }

  if (!finalVendorId) {
    console.log('[estimateDeliveryFee] No vendorId found');
    return apiResponse.error(res, 'No vendor specified. Please add items to your cart or provide a vendorId.', 400);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: finalVendorId },
    select: { id: true, latitude: true, longitude: true, city: true, state: true },
  });
  if (!vendor || !vendor.latitude || !vendor.longitude) {
    return apiResponse.error(res, 'Vendor not found or missing coordinates.', 404);
  }

  // Use new pricing engine
  const pricingResult = await calculateDeliveryFee({
    vendorLat: vendor.latitude,
    vendorLng: vendor.longitude,
    customerLat: deliveryAddress.latitude,
    customerLng: deliveryAddress.longitude,
    country: 'Nigeria',
    state: vendor.state,
    city: vendor.city,
    vendorId: vendor.id,
  });

  return apiResponse.success(res, 'Delivery fee estimated.', { 
    deliveryFee: pricingResult.finalFee, 
    distanceKm: pricingResult.distanceKm,
    breakdown: pricingResult,
  });
});

export const placeOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deliveryAddressId, paymentMethod, note } = req.body;

  const customer = await prisma.customer.findUnique({
    where: { userId: req.user!.userId },
    include: {
      cart: {
        include: {
          items: {
            include: {
              menuItem: {
                select: { id: true, name: true, price: true, isAvailable: true, stockQuantity: true, vendorId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!customer) return apiResponse.error(res, 'Customer not found.', 404);
  if (!customer.cart || !customer.cart.items.length) return apiResponse.error(res, 'Cart is empty.', 400);

  const { cart } = customer;

  const unavailable = cart.items.find((i) => !i.menuItem.isAvailable || i.menuItem.stockQuantity <= 0);
  if (unavailable) return apiResponse.error(res, `${unavailable.menuItem.name} is no longer available.`, 400);
  const overStocked = cart.items.find((i) => i.quantity > i.menuItem.stockQuantity);
  if (overStocked) {
    return apiResponse.error(res, `Only ${overStocked.menuItem.stockQuantity} ${overStocked.menuItem.name} left in stock.`, 400);
  }

  const deliveryAddress = await prisma.address.findFirst({
    where: { id: deliveryAddressId, customerId: customer.id },
  });
  if (!deliveryAddress) return apiResponse.error(res, 'Delivery address not found.', 404);

  const vendor = await prisma.vendor.findUnique({
    where: { id: cart.vendorId! },
    select: { id: true, latitude: true, longitude: true, commissionTier: true, isOpen: true, city: true, state: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);
  if (!vendor.isOpen) return apiResponse.error(res, 'This vendor is currently closed.', 400);

  const subtotal = cart.items.reduce((sum, i) => sum + (i.unitPrice ?? i.menuItem.price) * i.quantity, 0);

  if (!vendor.latitude || !vendor.longitude || !deliveryAddress.latitude || !deliveryAddress.longitude) {
    return apiResponse.error(res, 'Missing coordinates for distance calculation.', 400);
  }

  // Use new pricing engine
  const pricingResult = await calculateDeliveryFee({
    vendorLat: vendor.latitude,
    vendorLng: vendor.longitude,
    customerLat: deliveryAddress.latitude,
    customerLng: deliveryAddress.longitude,
    country: 'Nigeria',
    state: vendor.state,
    city: vendor.city,
    vendorId: vendor.id,
  });

  const originalDeliveryFee = pricingResult.finalFee;
  const { fee: deliveryFee, creditUsed } = await applyFreeDelivery(customer.id, originalDeliveryFee);
  const { platformFee, netAmount } = calcVendorFee(subtotal, vendor.commissionTier);
  const totalAmount = subtotal + deliveryFee;
  const estimatedTime = pricingResult.durationMinutes;

  let order: any;
  try {
    order = await prisma.$transaction(async (tx) => {
      for (const item of cart.items) {
        const stockUpdate = await tx.menuItem.updateMany({
          where: {
            id: item.menuItem.id,
            isAvailable: true,
            stockQuantity: { gte: item.quantity },
          },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (stockUpdate.count === 0) {
          throw new Error(`INSUFFICIENT_STOCK:${item.menuItem.name}`);
        }
      }

      const newOrder = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: customer.id,
          vendorId: vendor.id,
          status: paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
          subtotal,
          deliveryFee,
          originalDeliveryFee,
          platformFee,
          totalAmount,
          freeDeliveryUsed: creditUsed,
          deliveryAddress: deliveryAddress.address,
          deliveryLatitude: deliveryAddress.latitude,
          deliveryLongitude: deliveryAddress.longitude,
          distanceKm: pricingResult.distanceKm,
          paymentMethod: paymentMethod as PaymentMethod,
          stockReserved: true,
          note,
          estimatedTime,
          items: {
            create: cart.items.map((i) => ({
              menuItemId: i.menuItem.id,
              name: i.menuItem.name,
              price: i.menuItem.price,
              quantity: i.quantity,
            })),
          },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('INSUFFICIENT_STOCK:')) {
      const itemName = err.message.replace('INSUFFICIENT_STOCK:', '');
      return apiResponse.error(res, `${itemName} does not have enough stock.`, 400);
    }
    throw err;
  }

  try {
    getIO().of('/orders').to(`vendor:${vendor.id}`).emit('order:new', { order });
  } catch { /* socket may not be connected */ }

  notifyUser(req.user!.userId, {
    title: 'Order Placed! 🎉',
    body: `Your order #${order.orderNumber} has been received and is being processed.`,
    type: 'order',
    data: { orderId: order.id },
  }).catch(() => {});

  return apiResponse.success(res, 'Order placed.', order, 201);
});

export const cancelOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!customer) return apiResponse.error(res, 'Customer not found.', 404);

  const order = await prisma.order.findFirst({
    where: { id: req.params.id, customerId: customer.id },
    include: { items: { select: { menuItemId: true, quantity: true } } },
  });
  if (!order) return apiResponse.error(res, 'Order not found.', 404);

  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    return apiResponse.error(res, 'Order cannot be cancelled at this stage.', 400);
  }

  const settings = await getPlatformSettings();
  const cancelUntil = order.createdAt.getTime() + settings.cancellationWindowMinutes * 60_000;
  if (Date.now() > cancelUntil) {
    return apiResponse.error(res, `Orders can only be cancelled within ${settings.cancellationWindowMinutes} minutes.`, 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED, cancelReason: req.body.reason },
    });
    if (order.stockReserved) {
      await Promise.all(order.items.map((item) =>
        tx.menuItem.update({
          where: { id: item.menuItemId },
          data: { stockQuantity: { increment: item.quantity } },
        }),
      ));
      await tx.order.update({
        where: { id: order.id },
        data: { stockReserved: false },
      });
    }
  });

  return apiResponse.success(res, 'Order cancelled.');
});

export const rateOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({
    where: { userId: req.user!.userId },
    select: { id: true },
  });
  if (!customer) return apiResponse.error(res, 'Customer not found.', 404);

  const { rating, review } = req.body;
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, customerId: customer.id, status: OrderStatus.DELIVERED },
  });
  if (!order) return apiResponse.error(res, 'Order not found or not yet delivered.', 404);
  if (order.rating) return apiResponse.error(res, 'Order already rated.', 400);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { rating, review } });

    const vendor = await tx.vendor.findUnique({
      where: { id: order.vendorId },
      select: { rating: true, totalRatings: true },
    });
    if (vendor) {
      const newTotal = vendor.totalRatings + 1;
      const newRating = (vendor.rating * vendor.totalRatings + rating) / newTotal;
      await tx.vendor.update({ where: { id: order.vendorId }, data: { rating: newRating, totalRatings: newTotal } });
    }
  });

  return apiResponse.success(res, 'Order rated. Thank you!');
});
