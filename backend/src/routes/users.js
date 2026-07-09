const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { hashPassword, validatePasswordStrength } = require('../utils/password');
const { validate, roleUpdateSchema, adminResetPasswordSchema } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, NOTIFICATION_TYPES } = require('../utils/enums');
const { getSettings } = require('../utils/settings');
const { revokeAllSessionsForUser } = require('../utils/session');
const { notify } = require('../utils/notify');

const router = express.Router();

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
}

router.use(authenticate, requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const { role, q } = req.query;
    const where = {};
    if (role) where.role = role;
    if (q) where.username = { contains: String(q) };

    const users = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ users: users.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/questions', async (req, res, next) => {
  try {
    const questions = await prisma.question.findMany({
      where: { createdById: req.params.id },
      include: { module: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ questions });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/role', async (req, res, next) => {
  try {
    const data = validate(roleUpdateSchema, req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = await prisma.user.update({ where: { id: target.id }, data: { role: data.role } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.ROLE_CHANGE,
      targetType: AUDIT_TARGET_TYPES.USER,
      targetId: target.id,
      details: { from: target.role, to: data.role },
      ipAddress: req.ip,
    });

    await notify({
      userId: target.id,
      actorId: req.user.id,
      type: NOTIFICATION_TYPES.ROLE_CHANGED,
      message: `Your role was changed from ${target.role.replace('_', ' ')} to ${data.role.replace('_', ' ')}.`,
    });

    res.json({ user: toPublicUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const data = validate(adminResetPasswordSchema, req.body);
    const settings = await getSettings();
    const strengthError = validatePasswordStrength(data.newPassword, settings);
    if (strengthError) return res.status(400).json({ error: strengthError });

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const passwordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash, failedLoginAttempts: 0, accountLockedUntil: null },
    });
    await revokeAllSessionsForUser(target.id);

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      targetType: AUDIT_TARGET_TYPES.PASSWORD_RESET,
      targetId: target.id,
      details: { method: 'admin_forced' },
      ipAddress: req.ip,
    });

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/deactivate', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
    await revokeAllSessionsForUser(target.id);

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.ACCOUNT_DEACTIVATED,
      targetType: AUDIT_TARGET_TYPES.USER,
      targetId: target.id,
      ipAddress: req.ip,
    });

    res.json({ user: toPublicUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/reactivate', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = await prisma.user.update({ where: { id: target.id }, data: { isActive: true } });
    res.json({ user: toPublicUser(updated) });
  } catch (err) {
    next(err);
  }
});

// Force logout from every device — revokes all of the target user's active sessions.
router.post('/:id/force-logout', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    await revokeAllSessionsForUser(target.id);

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: AUDIT_TARGET_TYPES.SESSION,
      targetId: target.id,
      details: { scope: 'admin_force_logout', targetUsername: target.username },
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
