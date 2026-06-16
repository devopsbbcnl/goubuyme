import 'dotenv/config';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PAYSTACK_SECRET_KEY',
  'CLIENT_URL',
  'ADMIN_URL',
  'RESEND_API_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required env var: ${key}`);
    process.exit(1);
  }
}

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDB } from './config/db';
import { setIO } from './config/socket';
import passport from './config/passport';
import { setupSockets } from './sockets';
import { startPayoutJob } from './jobs/payoutJob';
import { errorHandler } from './middleware/error.middleware';
import { globalLimiter } from './middleware/rateLimiter.middleware';
import { maintenanceGuard } from './middleware/maintenance.middleware';
import authRoutes from './routes/auth.routes';
import vendorRoutes from './routes/vendor.routes';
import customerRoutes from './routes/customer.routes';
import orderRoutes from './routes/order.routes';
import paymentRoutes from './routes/payment.routes';
import notificationRoutes from './routes/notification.routes';
import riderRoutes from './routes/rider.routes';
import adminRoutes from './routes/admin.routes';
import offerRoutes from './routes/offer.routes';
import supportRoutes from './routes/support.routes';
import messageRoutes from './routes/message.routes';
import logger from './utils/logger';

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL || '',
  process.env.ADMIN_URL || '',
  'http://localhost:3000',
].filter(Boolean);

const io = new Server(httpServer, {
  // Temporary diagnostic: native/mobile Socket.IO handshakes may not present
  // an Origin header matching CLIENT_URL/ADMIN_URL exactly.
  // If sockets connect after this change, we know it's a CORS/origin issue.
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
setIO(io);

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));
app.use(globalLimiter);
app.use(maintenanceGuard);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/vendors', vendorRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1', customerRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/riders', riderRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/offers', offerRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/messages', messageRoutes);

// Public endpoint for mobile apps to fetch delivery fee settings
app.get('/api/v1/settings/public', async (_req, res) => {
  try {
    const settings = await (await import('./services/settings.service')).getPlatformSettings();
    return res.json({
      success: true,
      data: {
        deliveryBaseFee: settings.deliveryBaseFee,
        deliveryPerKmRate: settings.deliveryPerKmRate,
        deliveryMaxFee: settings.deliveryMaxFee,
        maxDeliveryRadiusKm: settings.maxDeliveryRadiusKm,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});

app.get('/health', cors({ origin: '*' }), (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

setupSockets(io);

const PORT = Number(process.env.PORT) || 5000;

const start = async () => {
  await connectDB();
  startPayoutJob();
  httpServer.listen(PORT, '0.0.0.0', () => logger.info(`GoBuyMe API running on port ${PORT}`));
};

start();
