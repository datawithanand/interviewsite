const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate, securityQuestionTemplateCreateSchema, securityQuestionTemplateUpdateSchema } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = require('../utils/enums');

const router = express.Router();

// Public (unauthenticated) — the registration form needs this list before a
// user has an account. Only active questions are ever exposed here.
router.get('/', async (req, res, next) => {
  try {
    const templates = await prisma.securityQuestionTemplate.findMany({
      where: { isActive: true },
      orderBy: { question: 'asc' },
    });
    res.json({ templates: templates.map((t) => ({ id: t.id, question: t.question })) });
  } catch (err) {
    next(err);
  }
});

router.get('/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const templates = await prisma.securityQuestionTemplate.findMany({ orderBy: { question: 'asc' } });
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const data = validate(securityQuestionTemplateCreateSchema, req.body);
    const existing = await prisma.securityQuestionTemplate.findUnique({ where: { question: data.question } });
    if (existing) return res.status(409).json({ error: 'This question already exists.' });

    const template = await prisma.securityQuestionTemplate.create({ data: { question: data.question } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.SETTINGS,
      targetId: template.id,
      details: { question: template.question },
      ipAddress: req.ip,
    });

    res.status(201).json({ template });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const data = validate(securityQuestionTemplateUpdateSchema, req.body);
    const existing = await prisma.securityQuestionTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    const updated = await prisma.securityQuestionTemplate.update({ where: { id: existing.id }, data });
    res.json({ template: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.securityQuestionTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    await prisma.securityQuestionTemplate.delete({ where: { id: existing.id } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.DELETE,
      targetType: AUDIT_TARGET_TYPES.SETTINGS,
      targetId: existing.id,
      details: { question: existing.question },
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
