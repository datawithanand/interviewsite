const express = require('express');
const prisma = require('../db');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { requireWriterOrAdmin } = require('../middleware/rbac');
const { validate, moduleCreateSchema, moduleUpdateSchema } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = require('../utils/enums');

const router = express.Router();

router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    const modules = await prisma.module.findMany({
      where: { isArchived: false },
      orderBy: { name: 'asc' },
      include: { _count: { select: { questions: true } } },
    });
    res.json({
      modules: modules.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        questionCount: m._count.questions,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const module = await prisma.module.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { questions: true } } },
    });
    if (!module || module.isArchived) return res.status(404).json({ error: 'Module not found.' });

    const lastQuestion = await prisma.question.findFirst({
      where: { moduleId: module.id },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    res.json({
      module: {
        id: module.id,
        name: module.name,
        description: module.description,
        questionCount: module._count.questions,
        createdAt: module.createdAt,
        updatedAt: module.updatedAt,
        lastQuestionUpdatedAt: lastQuestion ? lastQuestion.updatedAt : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const data = validate(moduleCreateSchema, req.body);
    const existing = await prisma.module.findUnique({ where: { name: data.name } });
    if (existing) return res.status(409).json({ error: 'A module with this name already exists.' });

    const module = await prisma.module.create({
      data: { name: data.name, description: data.description || null, createdById: req.user.id },
    });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.MODULE,
      targetId: module.id,
      details: { name: module.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ module });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const data = validate(moduleUpdateSchema, req.body);
    const existing = await prisma.module.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isArchived) return res.status(404).json({ error: 'Module not found.' });

    if (data.name && data.name !== existing.name) {
      const nameTaken = await prisma.module.findUnique({ where: { name: data.name } });
      if (nameTaken) return res.status(409).json({ error: 'A module with this name already exists.' });
    }

    const updated = await prisma.module.update({ where: { id: existing.id }, data });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EDIT,
      targetType: AUDIT_TARGET_TYPES.MODULE,
      targetId: updated.id,
      details: { changes: data },
      ipAddress: req.ip,
    });

    res.json({ module: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.module.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isArchived) return res.status(404).json({ error: 'Module not found.' });

    // Soft delete to avoid orphaning questions/history; keeps the name
    // reserved so re-creating an identically named module is a conscious act.
    await prisma.module.update({ where: { id: existing.id }, data: { isArchived: true } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.DELETE,
      targetType: AUDIT_TARGET_TYPES.MODULE,
      targetId: existing.id,
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
