import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { calculateDeliveryFee } from '../services/pricing.service';
import { calcVendorFee } from '../services/commission.service';
import { applyFreeDelivery } from '../services/referral.service';
import { evaluatePromo } from '../services/offer.service';
import { getPlatformSettings } from '../services/settings.service';
import { getIO } from '../config/socket';
import { notifyUser } from '../services/notification.service';
import { recordOnboardingEvent } from '../services/onboarding.service';
import { PaymentMethod, OrderStatus } from '@prisma/client';

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `GBM-${date}-${rand}`;
};

// 4-digit PIN the customer hands to the rider on arrival to confirm delivery.
const generateDeliveryPin = () => String(Math.floor(1000 + Math.random() * 9000));

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
                select: { vendorId: true, price: true }
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

  const subtotal = (customer.cart?.items ?? []).reduce(
    (sum, i) => sum + (i.unitPrice ?? i.menuItem.price) * i.quantity,
    0,
  );

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
    subtotal,
  });

  // Preview the fee the customer will actually be charged. Read-only: no credit is consumed here
  // (placeOrder decrements the credit). Threshold wins over credit, matching placeOrder's order.
  const originalDeliveryFee = pricingResult.finalFee;
  let deliveryFee = originalDeliveryFee;
  let freeDeliveryReason: 'THRESHOLD' | 'CREDIT' | null = null;
  if (pricingResult.freeDeliveryApplied) {
    deliveryFee = 0;
    freeDeliveryReason = 'THRESHOLD';
  } else if (originalDeliveryFee > 0) {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { freeDeliveryCredits: true },
    });
    if (user && user.freeDeliveryCredits > 0) {
      deliveryFee = 0;
      freeDeliveryReason = 'CREDIT';
    }
  }

  return apiResponse.success(res, 'Delivery fee estimated.', {
    deliveryFee,
    originalDeliveryFee,
    freeDelivery: freeDeliveryReason !== null,
    freeDeliveryReason,
    freeDeliveryThreshold: pricingResult.freeDeliveryThreshold,
    distanceKm: pricingResult.distanceKm,
    breakdown: pricingResult,
  });
});

// GET /orders/validate-promo?code=&vendorId=
export const validatePromo = catchAsync(async (req: AuthRequest, res: Response) => {
  const { code, vendorId } = req.query as { code?: string; vendorId?: string };
  if (!code) return apiResponse.error(res, 'Promo code is required.', 400);

  const customer = await prisma.customer.findUnique({
    where: { userId: req.user!.userId },
    include: {
      cart: { include: { items: { include: { menuItem: { select: { vendorId: true, price: true } } } } } },
    },
  });
  if (!customer) return apiResponse.error(res, 'Customer not found.', 404);

  const items = customer.cart?.items ?? [];
  if (!items.length) return apiResponse.error(res, 'Your cart is empty.', 400);

  const subtotal = items.reduce((sum, i) => sum + (i.unitPrice ?? i.menuItem.price) * i.quantity, 0);
  const cartVendorId = vendorId || customer.cart?.vendorId || items[0].menuItem.vendorId;

  const result = await evaluatePromo({
    code,
    userId: req.user!.userId,
    vendorId: cartVendorId!,
    subtotal,
  });

  return apiResponse.success(res, result.valid ? 'Promo code applied.' : (result.reason ?? 'Invalid promo code.'), result);
});

export const placeOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const { deliveryAddressId, paymentMethod, note, promoCode } = req.body;

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
    subtotal,
  });

  const originalDeliveryFee = pricingResult.finalFee;

  // Validate any promo code up front. A code that was supplied but doesn't apply fails the order,
  // so the customer isn't silently charged full price when they expected a discount.
  const promo = promoCode
    ? await evaluatePromo({ code: promoCode, userId: req.user!.userId, vendorId: vendor.id, subtotal })
    : null;
  if (promo && !promo.valid) {
    return apiResponse.error(res, promo.reason ?? 'Invalid promo code.', 400);
  }

  const freeByThreshold = pricingResult.freeDeliveryApplied;
  const freeByPromo = !!promo?.valid && promo.freeDelivery;

  // Free-delivery resolution order: threshold / free-delivery promo first (neither burns a credit),
  // then a referral credit only if the fee is still payable.
  let deliveryFee = originalDeliveryFee;
  let creditUsed = false;
  if (freeByThreshold || freeByPromo) {
    deliveryFee = 0;
  } else if (originalDeliveryFee > 0) {
    const credit = await applyFreeDelivery(customer.id, originalDeliveryFee);
    deliveryFee = credit.fee;
    creditUsed = credit.creditUsed;
  }

  const subtotalDiscount = promo?.valid ? promo.subtotalDiscount : 0;
  // A free-delivery promo only "counts" when it actually saved the delivery fee (i.e. delivery
  // wasn't already free via the threshold). Otherwise the redemption isn't recorded/consumed.
  const deliverySavedByPromo = freeByPromo && !freeByThreshold ? originalDeliveryFee : 0;
  const promoApplied = !!promo?.valid && (subtotalDiscount > 0 || deliverySavedByPromo > 0);
  const promoDiscount = subtotalDiscount + deliverySavedByPromo;

  const { platformFee, netAmount } = await calcVendorFee(subtotal, vendor.commissionTier);
  const totalAmount = subtotal + deliveryFee - subtotalDiscount;
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
          deliveryPin: generateDeliveryPin(),
          customerId: customer.id,
          vendorId: vendor.id,
          status: paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
          subtotal,
          deliveryFee,
          originalDeliveryFee,
          platformFee,
          totalAmount,
          freeDeliveryUsed: creditUsed,
          promoCode: promoApplied ? promo!.code : null,
          promoDiscount: promoApplied ? promoDiscount : 0,
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

      if (promoApplied) {
        // The unique (offerId, userId) constraint makes this the atomic guard against a customer
        // redeeming the same code twice via concurrent requests.
        await tx.offerRedemption.create({
          data: {
            offerId: promo!.offerId!,
            userId: req.user!.userId,
            orderId: newOrder.id,
            code: promo!.code!,
            discount: promoDiscount,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('INSUFFICIENT_STOCK:')) {
      const itemName = err.message.replace('INSUFFICIENT_STOCK:', '');
      return apiResponse.error(res, `${itemName} does not have enough stock.`, 400);
    }
    if (err?.code === 'P2002' && Array.isArray(err?.meta?.target) && err.meta.target.includes('offerId')) {
      return apiResponse.error(res, 'You have already used this promo code.', 400);
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

  // First order = customer activation (idempotent — only the first order counts).
  void recordOnboardingEvent(req.user!.userId, 'CUSTOMER', 'FIRST_ORDER');

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
