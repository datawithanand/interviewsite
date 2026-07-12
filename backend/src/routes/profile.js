const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { validate } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = require('../utils/enums');
const { getSettings } = require('../utils/settings');
const { revokeAllSessionsForUser } = require('../utils/session');

const router = express.Router();

const THEME_VALUES = ['ocean', 'sunset', 'forest', 'midnight', 'slate', 'light', 'dark'];

const profileUpdateSchema = z.object({
  email: z.string().trim().email().optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  profileAvatarUrl: z.string().trim().url().max(2000).optional().nullable(),
  themePreference: z.enum(THEME_VALUES).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

const securityQuestionUpdateSchema = z
  .object({
    templateId: z.string().min(1).optional(),
    customQuestion: z.string().trim().min(3).max(200).optional(),
    answer: z.string().trim().min(1).max(200),
  })
  .refine((d) => Boolean(d.templateId) !== Boolean(d.customQuestion), {
    message: 'Choose one predefined security question or provide a custom question, not both.',
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
      themePreference: req.user.themePreference,
      createdAt: req.user.createdAt,
      lastLogin: req.user.lastLogin,
      securityQuestion: req.user.securityQuestion,
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
        themePreference: updated.themePreference,
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

    const settings = await getSettings();
    const strengthError = validatePasswordStrength(data.newPassword, settings);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });

    // Keep the current session alive, sign out everywhere else.
    await revokeAllSessionsForUser(req.user.id, req.session.id);

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

router.put('/security-question', async (req, res, next) => {
  try {
    const data = validate(securityQuestionUpdateSchema, req.body);

    let questionText;
    if (data.templateId) {
      const template = await prisma.securityQuestionTemplate.findUnique({ where: { id: data.templateId } });
      if (!template || !template.isActive) return res.status(400).json({ error: 'Selected security question is no longer available.' });
      questionText = template.question;
    } else {
      questionText = data.customQuestion;
    }

    const securityAnswerHash = await hashPassword(data.answer.trim().toLowerCase());
    await prisma.user.update({
      where: { id: req.user.id },
      data: { securityQuestion: questionText, securityAnswerHash },
    });

    res.json({ message: 'Security question updated.' });
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
    await revokeAllSessionsForUser(req.user.id);
    res.json({ message: 'Account deactivated.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
