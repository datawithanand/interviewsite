const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { validate } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = require('../utils/enums');

const router = express.Router();

const profileUpdateSchema = z.object({
  email: z.string().trim().email().optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  profileAvatarUrl: z.string().trim().url().max(2000).optional().nullable(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

const securityQuestionsUpdateSchema = z.object({
  securityQuestions: z
    .array(z.object({ question: z.string().trim().min(3).max(200), answer: z.string().trim().min(1).max(200) }))
    .min(3)
    .max(5),
});

router.use(authenticate);

router.get('/', async (req, res) => {
  const count = await prisma.question.count({ where: { createdById: req.user.id } });
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      bio: req.user.bio,
      profileAvatarUrl: req.user.profileAvatarUrl,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
      questionsCreated: count,
    },
  });
});

router.patch('/', async (req, res, next) => {
  try {
    const data = validate(profileUpdateSchema, req.body);
    const updated = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        bio: updated.bio,
        profileAvatarUrl: updated.profileAvatarUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', async (req, res, next) => {
  try {
    const data = validate(changePasswordSchema, req.body);
    const valid = await verifyPassword(data.currentPassword, req.user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const strengthError = validatePasswordStrength(data.newPassword);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      targetType: AUDIT_TARGET_TYPES.PASSWORD_RESET,
      targetId: req.user.id,
      details: { method: 'self_service' },
      ipAddress: req.ip,
    });

    res.json({ message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
});

router.put('/security-questions', async (req, res, next) => {
  try {
    const data = validate(securityQuestionsUpdateSchema, req.body);
    const hashed = await Promise.all(
      data.securityQuestions.map(async (sq) => ({
        question: sq.question,
        answerHash: await hashPassword(sq.answer.trim().toLowerCase()),
        userId: req.user.id,
      }))
    );

    await prisma.$transaction([
      prisma.securityQuestion.deleteMany({ where: { userId: req.user.id } }),
      prisma.securityQuestion.createMany({ data: hashed }),
    ]);

    res.json({ message: 'Security questions updated.' });
  } catch (err) {
    next(err);
  }
});

// Self-service account deletion, requires password confirmation.
router.post('/delete', async (req, res, next) => {
  try {
    const schema = z.object({ password: z.string().min(1) });
    const data = validate(schema, req.body);
    const valid = await verifyPassword(data.password, req.user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

    await prisma.user.update({ where: { id: req.user.id }, data: { isActive: false } });
    res.json({ message: 'Account deactivated.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
