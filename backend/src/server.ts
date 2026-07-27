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

// Sentry's auto-instrumentation patches Express at require-time, so Sentry.init()
// must run before `express` is ever imported — otherwise it silently instruments
// nothing (logs "express is not instrumented" and just never captures anything
// route-related). This project compiles to CommonJS with imports executing in
// source order, so putting this block above `import express` is what makes it work.
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
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

// Native/mobile Socket.IO clients (socket.io-client on React Native) don't send a
// browser-style Origin header, so they're allowed through unconditionally. Any
// request that DOES present an Origin header (web app, admin dashboard) must match
// the same allowlist used for the REST API below.
const socketOriginCheck = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
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

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(errorHandler);

setupSockets(io);

const PORT = Number(process.env.PORT) || 5000;

const start = async () => {
  await connectDB();
  startPayoutJob();
  httpServer.listen(PORT, '0.0.0.0', () => logger.info(`GoBuyMe API running on port ${PORT}`));
};

start();
