const express = require('express');
const prisma = require('../db');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, ROLES } = require('../utils/enums');
const {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordStartSchema,
  forgotPasswordVerifySchema,
} = require('../utils/validation');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const SECURITY_QUESTIONS_TO_PRESENT = 3;
const SECURITY_QUESTIONS_REQUIRED_CORRECT = 2;

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
    const data = validate(registerSchema, req.body);

    const strengthError = validatePasswordStrength(data.password);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) return res.status(409).json({ error: 'Username is already taken.' });

    const passwordHash = await hashPassword(data.password);
    const securityQuestionsData = await Promise.all(
      data.securityQuestions.map(async (sq) => ({
        question: sq.question,
        answerHash: await hashPassword(sq.answer.trim().toLowerCase()),
      }))
    );

    // First registered user becomes admin so the platform is bootstrappable
    // without a separate seed step; every subsequent signup is a regular user.
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? ROLES.ADMIN : ROLES.REGULAR_USER;

    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email || null,
        passwordHash,
        role,
        securityQuestions: { create: securityQuestionsData },
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

    const token = signToken({ sub: user.id, role: user.role });
    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
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
      const lock = failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : failedLoginAttempts,
          accountLockedUntil: lock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
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

    const token = signToken({ sub: user.id, role: user.role });
    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// Step 1: given a username, return a random subset of that user's security
// questions (ids + question text only — never answers) to present.
router.post('/forgot-password/start', async (req, res, next) => {
  try {
    const data = validate(forgotPasswordStartSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { username: data.username },
      include: { securityQuestions: true },
    });

    // Always respond with a (possibly empty) question set — never reveal
    // whether the username exists.
    if (!user || user.securityQuestions.length === 0) {
      return res.json({ questions: [] });
    }

    const shuffled = [...user.securityQuestions].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(SECURITY_QUESTIONS_TO_PRESENT, shuffled.length));
    res.json({ questions: chosen.map((q) => ({ id: q.id, question: q.question })) });
  } catch (err) {
    next(err);
  }
});

// Step 2: verify answers to the presented questions and set a new password.
router.post('/forgot-password/verify', async (req, res, next) => {
  try {
    const data = validate(forgotPasswordVerifySchema, req.body);

    const strengthError = validatePasswordStrength(data.newPassword);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const user = await prisma.user.findUnique({
      where: { username: data.username },
      include: { securityQuestions: true },
    });

    if (!user) return res.status(400).json({ error: 'Unable to verify security questions.' });

    const byId = new Map(user.securityQuestions.map((q) => [q.id, q]));
    let correctCount = 0;
    for (const submitted of data.answers) {
      const record = byId.get(submitted.id);
      if (!record) continue;
      // eslint-disable-next-line no-await-in-loop
      const match = await verifyPassword(submitted.answer.trim().toLowerCase(), record.answerHash);
      if (match) correctCount += 1;
    }

    if (correctCount < SECURITY_QUESTIONS_REQUIRED_CORRECT) {
      await recordAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        targetType: AUDIT_TARGET_TYPES.PASSWORD_RESET,
        targetId: user.id,
        details: { correctCount, required: SECURITY_QUESTIONS_REQUIRED_CORRECT },
        ipAddress: req.ip,
        status: 'failure',
      });
      return res.status(401).json({ error: 'Security question answers did not match.' });
    }

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, accountLockedUntil: null },
    });

    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      targetType: AUDIT_TARGET_TYPES.PASSWORD_RESET,
      targetId: user.id,
      details: { method: 'security_questions' },
      ipAddress: req.ip,
    });

    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
