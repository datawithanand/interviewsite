const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

// Applied to /auth/login, /auth/register, /auth/forgot-password/* — these
// are the endpoints most attractive to credential-stuffing / brute force.
// Limits are relaxed under NODE_ENV=test so the integration suite (which
// legitimately hits these endpoints hundreds of times) isn't rate-limited.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// General API limiter — generous, mostly a backstop against scripted abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

module.exports = { authLimiter, apiLimiter };
