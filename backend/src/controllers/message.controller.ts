import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { getIO } from '../config/socket';

export const getOrCreateConversation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId } = req.params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, rider: true },
  });

  if (!order) {
    return apiResponse.error(res, 'Order not found.', 404);
  }

  if (!order.riderId) {
    return apiResponse.error(res, 'No rider assigned to this order yet.', 400);
  }

  // Check if user is authorized (customer or rider)
  const isCustomer = order.customer.userId === req.user!.userId;
  const isRider = order.rider?.userId === req.user!.userId;

  if (!isCustomer && !isRider) {
    return apiResponse.error(res, 'Unauthorized.', 403);
  }

  // Get or create conversation
  let conversation = await prisma.conversation.findUnique({
    where: { orderId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
      customer: {
        include: { user: { select: { name: true, avatar: true } } },
      },
      rider: {
        include: { user: { select: { name: true, avatar: true } } },
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        riderId: order.riderId,
      },
      include: {
        messages: true,
        customer: {
          include: { user: { select: { name: true, avatar: true } } },
        },
        rider: {
          include: { user: { select: { name: true, avatar: true } } },
        },
      },
    });
  }

  return apiResponse.success(res, 'Conversation retrieved.', conversation);
});

export const sendMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { conversationId, content } = req.body;

  if (!content || content.trim().length === 0) {
    return apiResponse.error(res, 'Message content is required.', 400);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true, rider: true },
  });

  if (!conversation) {
    return apiResponse.error(res, 'Conversation not found.', 404);
  }

  // Check if user is authorized (customer or rider)
  const isCustomer = conversation.customer.userId === req.user!.userId;
  const isRider = conversation.rider?.userId === req.user!.userId;

  if (!isCustomer && !isRider) {
    return apiResponse.error(res, 'Unauthorized.', 403);
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user!.userId,
      content: content.trim(),
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Emit real-time message via Socket.io
  try {
    const io = getIO();
    const ordersNs = io.of('/orders');
    
    // Send to customer
    ordersNs.to(`user:${conversation.customer.userId}`).emit('message:receive', {
      message,
      conversationId,
    });
    
    // Send to rider
    if (conversation.rider) {
      ordersNs.to(`user:${conversation.rider.userId}`).emit('message:receive', {
        message,
        conversationId,
      });
    }
  } catch (error) {
    console.error('Socket error:', error);
  }

  return apiResponse.success(res, 'Message sent.', message, 201);
});

export const markMessagesAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
  const { conversationId } = req.params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true, rider: true },
  });

  if (!conversation) {
    return apiResponse.error(res, 'Conversation not found.', 404);
  }

  // Check if user is authorized (customer or rider)
  const isCustomer = conversation.customer.userId === req.user!.userId;
  const isRider = conversation.rider?.userId === req.user!.userId;

  if (!isCustomer && !isRider) {
    return apiResponse.error(res, 'Unauthorized.', 403);
  }

  // Mark all unread messages from the other participant as read
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: req.user!.userId },
      isRead: false,
    },
    data: { isRead: true },
  });

  return apiResponse.success(res, 'Messages marked as read.');
});

export const getConversations = catchAsync(async (req: AuthRequest, res: Response) => {
  const userRole = req.user!.role;

  let conversations;

  if (userRole === 'CUSTOMER') {
    const customer = await prisma.customer.findUnique({
      where: { userId: req.user!.userId },
    });
    
    if (!customer) {
      return apiResponse.error(res, 'Customer not found.', 404);
    }

    conversations = await prisma.conversation.findMany({
      where: { customerId: customer.id },
      include: {
        order: {
          select: { orderNumber: true, status: true },
        },
        rider: {
          include: { user: { select: { name: true, avatar: true, phone: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  } else if (userRole === 'RIDER') {
    const rider = await prisma.rider.findUnique({
      where: { userId: req.user!.userId },
    });
    
    if (!rider) {
      return apiResponse.error(res, 'Rider not found.', 404);
    }

    conversations = await prisma.conversation.findMany({
      where: { riderId: rider.id },
      include: {
        order: {
          select: { orderNumber: true, status: true },
        },
        customer: {
          include: { user: { select: { name: true, avatar: true, phone: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  } else {
    return apiResponse.error(res, 'Invalid user role.', 400);
  }

  return apiResponse.success(res, 'Conversations retrieved.', conversations);
});
