import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { haversineDistance, calcDeliveryFee, estimateDeliveryMinutes } from '../services/distance.service';
import { calcVendorFee } from '../services/commission.service';
import { applyFreeDelivery } from '../services/referral.service';
import { getIO } from '../config/socket';
import { notifyUser } from '../services/notification.service';
import { PaymentMethod, OrderStatus } from '@prisma/client';

const generateOrderNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `GBM-${date}-${rand}`;
};

export const estimateDeliveryFee = catchAsync(async (req: AuthRequest, res: Response) => {
  const { addressId } = req.query as { addressId?: string };
  if (!addressId) return apiResponse.error(res, 'addressId is required.', 400);

  const customer = await prisma.customer.findUnique({
    where: { userId: req.user!.userId },
    include: { cart: true },
  });
  if (!customer) return apiResponse.error(res, 'Customer not found.', 404);

  const deliveryAddress = await prisma.address.findFirst({
    where: { id: addressId, customerId: customer.id },
  });
  if (!deliveryAddress) return apiResponse.error(res, 'Address not found.', 404);

  let distanceKm = 3;
  if (customer.cart?.vendorId) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: customer.cart.vendorId },
      select: { latitude: true, longitude: true },
    });
    if (vendor?.latitude && vendor?.longitude && deliveryAddress.latitude && deliveryAddress.longitude) {
      distanceKm = haversineDistance(
        vendor.latitude, vendor.longitude,
        deliveryAddress.latitude, deliveryAddress.longitude,
      );
    }
  }

  const fee = calcDeliveryFee(distanceKm);
  return apiResponse.success(res, 'Delivery fee estimated.', { deliveryFee: fee, distanceKm: Math.round(distanceKm * 100) / 100 });
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
                select: { id: true, name: true, price: true, isAvailable: true, vendorId: true },
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

  const unavailable = cart.items.find((i) => !i.menuItem.isAvailable);
  if (unavailable) return apiResponse.error(res, `${unavailable.menuItem.name} is no longer available.`, 400);

  const deliveryAddress = await prisma.address.findFirst({
    where: { id: deliveryAddressId, customerId: customer.id },
  });
  if (!deliveryAddress) return apiResponse.error(res, 'Delivery address not found.', 404);

  const vendor = await prisma.vendor.findUnique({
    where: { id: cart.vendorId! },
    select: { id: true, latitude: true, longitude: true, commissionTier: true, isOpen: true },
  });
  if (!vendor) return apiResponse.error(res, 'Vendor not found.', 404);
  if (!vendor.isOpen) return apiResponse.error(res, 'This vendor is currently closed.', 400);

  const subtotal = cart.items.reduce((sum, i) => sum + (i.unitPrice ?? i.menuItem.price) * i.quantity, 0);

  let distanceKm = 3;
  if (vendor.latitude && vendor.longitude && deliveryAddress.latitude && deliveryAddress.longitude) {
    distanceKm = haversineDistance(
      vendor.latitude, vendor.longitude,
      deliveryAddress.latitude, deliveryAddress.longitude,
    );
  }

  const originalDeliveryFee = calcDeliveryFee(distanceKm);
  const { fee: deliveryFee, creditUsed } = await applyFreeDelivery(customer.id, originalDeliveryFee);
  const { platformFee, netAmount } = calcVendorFee(subtotal, vendor.commissionTier);
  const totalAmount = subtotal + deliveryFee;
  const estimatedTime = estimateDeliveryMinutes(distanceKm);

  const order = await prisma.$transaction(async (tx) => {
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
        distanceKm: Math.round(distanceKm * 100) / 100,
        paymentMethod: paymentMethod as PaymentMethod,
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

  const order = await prisma.order.findFirst({ where: { id: req.params.id, customerId: customer.id } });
  if (!order) return apiResponse.error(res, 'Order not found.', 404);

  if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
    return apiResponse.error(res, 'Order cannot be cancelled at this stage.', 400);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED, cancelReason: req.body.reason },
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
