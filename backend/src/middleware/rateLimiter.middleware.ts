import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 'error', message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'error', message: 'Too many auth attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const locationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 360,
  message: { status: 'error', message: 'Location update rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
});
