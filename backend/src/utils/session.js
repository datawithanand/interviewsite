const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const prisma = require('../db');
const { signToken } = require('./jwt');
const { getSettings } = require('./settings');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Creates a Session row and a JWT bound to it (payload carries the session
// id as `sid`). The session's expiry — and therefore the token's — is
// admin-configurable via Settings.sessionTimeoutMinutes.
async function createSession(user, { ipAddress, userAgent } = {}) {
  const settings = await getSettings();
  const sessionId = uuid();
  const expiresAt = new Date(Date.now() + settings.sessionTimeoutMinutes * 60 * 1000);

  const token = signToken({ sub: user.id, role: user.role, sid: sessionId }, `${settings.sessionTimeoutMinutes}m`);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });

  return { token, sessionId, expiresAt };
}

async function getActiveSession(sessionId) {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || !session.isActive) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}

async function touchSession(sessionId) {
  await prisma.session.update({ where: { id: sessionId }, data: { lastActivity: new Date() } }).catch(() => {});
}

async function revokeSession(sessionId) {
  await prisma.session.update({ where: { id: sessionId }, data: { isActive: false } }).catch(() => {});
}

async function revokeAllSessionsForUser(userId, exceptSessionId = null) {
  await prisma.session.updateMany({
    where: { userId, isActive: true, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { isActive: false },
  });
}

module.exports = {
  hashToken,
  createSession,
  getActiveSession,
  touchSession,
  revokeSession,
  revokeAllSessionsForUser,
};
