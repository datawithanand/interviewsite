const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate } = require('../utils/validation');
const { getSettings, updateSettings } = require('../utils/settings');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = require('../utils/enums');

const router = express.Router();

const settingsUpdateSchema = z.object({
  passwordMinLength: z.number().int().min(6).max(64).optional(),
  passwordRequireLetter: z.boolean().optional(),
  passwordRequireNumber: z.boolean().optional(),
  maxFailedLoginAttempts: z.number().int().min(3).max(20).optional(),
  lockoutDurationMinutes: z.number().int().min(1).max(1440).optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(43200).optional(),
  registrationEnabled: z.boolean().optional(),
});

router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

router.patch('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const data = validate(settingsUpdateSchema, req.body);
    const settings = await updateSettings(data, req.user.id);

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EDIT,
      targetType: AUDIT_TARGET_TYPES.SETTINGS,
      details: { settingsChanged: Object.keys(data) },
      ipAddress: req.ip,
    });

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
