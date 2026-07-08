const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

// Minimum policy: 8+ chars, at least one letter, one number. Kept in one
// place so the admin settings panel (future work) has a single source to
// extend without touching route handlers.
const PASSWORD_POLICY = {
  minLength: 8,
  requireLetter: true,
  requireNumber: true,
};

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_POLICY.minLength) {
    return `Password must be at least ${PASSWORD_POLICY.minLength} characters long.`;
  }
  if (PASSWORD_POLICY.requireLetter && !/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter.';
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  return null;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { validatePasswordStrength, hashPassword, verifyPassword, PASSWORD_POLICY };
