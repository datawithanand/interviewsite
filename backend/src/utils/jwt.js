const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}

function signToken(payload, expiresIn = DEFAULT_EXPIRES_IN) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
