const express = require('express');
const prisma = require('../db');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { authenticate } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, ROLES } = require('../utils/enums');
const { getSettings } = require('../utils/settings');
const { createSession, revokeSession, revokeAllSessionsForUser } = require('../utils/session');
const {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordStartSchema,
  forgotPasswordVerifySchema,
} = require('../utils/validation');

const router = express.Router();

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    bio: user.bio,
    profileAvatarUrl: user.profileAvatarUrl,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const userCount = await prisma.user.count();
    // First registered user always becomes admin (bootstrap), regardless of
    // whether registration is later disabled for everyone else.
    if (!settings.registrationEnabled && userCount > 0) {
      return res.status(403).json({ error: 'Registration is currently disabled. Contact an administrator.' });
    }

    const data = validate(registerSchema, req.body);

    const strengthError = validatePasswordStrength(data.password, settings);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) return res.status(409).json({ error: 'Username is already taken.' });

    let securityQuestionText;
    if (data.securityQuestion.templateId) {
      const template = await prisma.securityQuestionTemplate.findUnique({ where: { id: data.securityQuestion.templateId } });
      if (!template || !template.isActive) {
        return res.status(400).json({ error: 'Selected security question is no longer available.' });
      }
      securityQuestionText = template.question;
    } else {
      securityQuestionText = data.securityQuestion.customQuestion;
    }

    const passwordHash = await hashPassword(data.password);
    const securityAnswerHash = await hashPassword(data.securityQuestion.answer.trim().toLowerCase());

    const role = userCount === 0 ? ROLES.ADMIN : ROLES.REGULAR_USER;

    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email || null,
        passwordHash,
        role,
        securityQuestion: securityQuestionText,
        securityAnswerHash,
      },
    });

    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.USER,
      targetId: user.id,
      details: { username: user.username, role },
      ipAddress: req.ip,
    });

    const { token } = await createSession(user, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const data = validate(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { username: data.username } });

    if (!user) {
      // Constant-shape response to avoid username enumeration.
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      await recordAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        targetType: AUDIT_TARGET_TYPES.USER,
        targetId: user.id,
        details: { reason: 'account_locked' },
        ipAddress: req.ip,
        status: 'failure',
      });
      return res.status(423).json({ error: 'Account is temporarily locked due to failed login attempts.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated.' });
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      const failedLoginAttempts = user.failedLoginAttempts + 1;
      const lock = failedLoginAttempts >= settings.maxFailedLoginAttempts;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : failedLoginAttempts,
          accountLockedUntil: lock ? new Date(Date.now() + settings.lockoutDurationMinutes * 60 * 1000) : null,
        },
      });
      await recordAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        targetType: AUDIT_TARGET_TYPES.USER,
        targetId: user.id,
        details: { attempt: failedLoginAttempts, locked: lock },
        ipAddress: req.ip,
        status: 'failure',
      });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, accountLockedUntil: null, lastLogin: new Date() },
    });

    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      targetType: AUDIT_TARGET_TYPES.USER,
      targetId: user.id,
      ipAddress: req.ip,
    });

    const { token } = await createSession(user, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await revokeSession(req.session.id);
    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: AUDIT_TARGET_TYPES.SESSION,
      targetId: req.session.id,
      ipAddress: req.ip,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// ---------- Session management (self-service) ----------

router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user.id, isActive: true },
      orderBy: { lastActivity: 'desc' },
    });
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        expiresAt: s.expiresAt,
        current: s.id === req.session.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id', authenticate, async (req, res, next) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session || session.userId !== req.user.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    await revokeSession(session.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Force logout from all devices except the one making this request.
router.post('/sessions/revoke-all', authenticate, async (req, res, next) => {
  try {
    await revokeAllSessionsForUser(req.user.id, req.session.id);
    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: AUDIT_TARGET_TYPES.SESSION,
      details: { scope: 'all_other_devices' },
      ipAddress: req.ip,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Step 1: given a username, confirm the account exists and return its single
// security question (never the answer). Per explicit product requirement,
// a nonexistent username gets a distinct 404 "User not found" rather than a
// generic response — this is a conscious username-enumeration trade-off.
router.post('/forgot-password/start', async (req, res, next) => {
  try {
    const data = validate(forgotPasswordStartSchema, req.body);
    const user = await prisma.user.findUnique({ where: { username: data.username } });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (!user.securityQuestion) {
      return res.status(400).json({ error: 'This account has no security question configured. Contact an administrator.' });
    }

    res.json({ question: user.securityQuestion });
  } catch (err) {
    next(err);
  }
});

// Step 2: verify the answer to the account's security question and set a new password.
router.post('/forgot-password/verify', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const data = validate(forgotPasswordVerifySchema, req.body);

    const strengthError = validatePasswordStrength(data.newPassword, settings);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const user = await prisma.user.findUnique({ where: { username: data.username } });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.securityAnswerHash) {
      return res.status(400).json({ error: 'This account has no security question configured. Contact an administrator.' });
    }

    const match = await verifyPassword(data.answer.trim().toLowerCase(), user.securityAnswerHash);
    if (!match) {
      await recordAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        targetType: AUDIT_TARGET_TYPES.PASSWORD_RESET,
        targetId: user.id,
        details: { reason: 'wrong_answer' },
        ipAddress: req.ip,
        status: 'failure',
      });
      return res.status(401).json({ error: 'Security question answer did not match.' });
    }

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, accountLockedUntil: null },
    });

    // Credentials changed — invalidate every existing session so a
    // possibly-compromised device is signed out everywhere.
    await revokeAllSessionsForUser(user.id);

    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      targetType: AUDIT_TARGET_TYPES.PASSWORD_RESET,
      targetId: user.id,
      details: { method: 'security_question' },
      ipAddress: req.ip,
    });

    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
