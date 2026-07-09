const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

// Fallback policy used only if Settings can't be loaded (e.g. bootstrapping
// before the singleton row exists). The live policy is admin-configurable
// via Settings — see src/utils/settings.js and routes/settings.js.
const DEFAULT_POLICY = {
  passwordMinLength: 8,
  passwordRequireLetter: true,
  passwordRequireNumber: true,
};

function validatePasswordStrength(password, policy = DEFAULT_POLICY) {
  const minLength = policy.passwordMinLength ?? DEFAULT_POLICY.passwordMinLength;
  const requireLetter = policy.passwordRequireLetter ?? DEFAULT_POLICY.passwordRequireLetter;
  const requireNumber = policy.passwordRequireNumber ?? DEFAULT_POLICY.passwordRequireNumber;

  if (typeof password !== 'string' || password.length < minLength) {
    return `Password must be at least ${minLength} characters long.`;
  }
  if (requireLetter && !/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter.';
  }
  if (requireNumber && !/[0-9]/.test(password)) {
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

module.exports = { validatePasswordStrength, hashPassword, verifyPassword, DEFAULT_POLICY };
