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

import prisma, { connectDB } from './config/db';
import { setIO } from './config/socket';
import { attachRedisAdapter } from './config/socketAdapter';
import { setupSockets } from './sockets';
import { startPayoutJob } from './jobs/payoutJob';
import { startStoreHoursJob } from './jobs/storeHoursJob';
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
import geocodeRoutes from './routes/geocode.routes';
import errorLogRoutes from './routes/errorLog.routes';
import logger from './utils/logger';

const app = express();
const httpServer = http.createServer(app);

// This API runs behind a reverse proxy (nginx) on the VPS, which sets
// X-Forwarded-For. Without `trust proxy`, express-rate-limit refuses to key
// off that header (rightly — trusting it blindly would let a client spoof
// their own IP and dodge every limit) and throws instead of limiting.
// `1` means "trust exactly one hop" — the proxy directly in front of Node —
// matching this deployment's actual topology (client -> nginx -> Node).
app.set('trust proxy', 1);

const allowedOrigins = [
  ...(process.env.CLIENT_URL ?? '').split(','),
  ...(process.env.ADMIN_URL ?? '').split(','),
  'http://localhost:3000',
  'http://localhost:3001',
].map(s => s.trim()).filter(Boolean);

// React Native's WebSocket (Android/OkHttp) DOES send an Origin header — set to
// the socket server's own URL, e.g. https://api.gobuyme.shop. That tripped the
// old allowlist and returned "400 Bad Request" on the WS upgrade ("Expected 101").
// These are the app's own origin(s), not a cross-site browser request we need to
// guard against — Socket.IO auth here is a token in the connection payload, not a
// cookie, so CORS adds no protection for native clients. Allow them explicitly.
// Configurable via SOCKET_ALLOWED_ORIGINS (comma-separated); falls back to the
// public API/website origins.
const socketAllowedOrigins = [
  ...allowedOrigins,
  ...(process.env.SOCKET_ALLOWED_ORIGINS ?? 'https://api.gobuyme.shop,https://gobuyme.shop')
    .split(',').map(s => s.trim()).filter(Boolean),
];

const socketOriginCheck = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // No Origin (e.g. server-side clients) or an allowed origin passes.
  if (!origin || socketAllowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'));
};

const io = new Server(httpServer, {
  cors: { origin: socketOriginCheck, methods: ['GET', 'POST'] },
});
setIO(io);

// Required for PM2 cluster mode: fan out broadcasts across all workers via Redis.
// No-op (with a warning) when REDIS_URL is unset, e.g. single-instance dev.
attachRedisAdapter(io);

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
app.use('/api/v1/geocode', geocodeRoutes);
app.use('/api/v1/errors', errorLogRoutes);

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

app.get('/health', cors({ origin: '*' }), async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('Health check DB probe failed', { error: (error as Error).message });
    return res.status(503).json({ status: 'error', db: 'down', timestamp: new Date().toISOString() });
  }
});

app.use(errorHandler);

setupSockets(io);

const PORT = Number(process.env.PORT) || 5000;

const start = async () => {
  await connectDB();
  startPayoutJob();
  startStoreHoursJob();
  httpServer.listen(PORT, '0.0.0.0', () => logger.info(`GoBuyMe API running on port ${PORT}`));
};

start();
