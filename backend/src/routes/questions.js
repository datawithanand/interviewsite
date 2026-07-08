const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireWriterOrAdmin } = require('../middleware/rbac');
const { validate, questionCreateSchema, questionUpdateSchema } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, ROLES } = require('../utils/enums');

const router = express.Router();

function canModify(user, question) {
  return user.role === ROLES.ADMIN || user.role === ROLES.WRITER;
}

function serializeQuestion(q, favoritedByMe = false) {
  return {
    id: q.id,
    moduleId: q.moduleId,
    module: q.module ? { id: q.module.id, name: q.module.name } : undefined,
    serialNumber: q.serialNumber,
    title: q.title,
    content: q.content,
    format: q.format,
    codeLanguage: q.codeLanguage,
    answer: q.answer,
    difficulty: q.difficulty,
    tags: JSON.parse(q.tags || '[]'),
    createdById: q.createdById,
    createdByUsername: q.createdBy ? q.createdBy.username : null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    viewCount: q.viewCount,
    favoriteCount: q._count ? q._count.favorites : undefined,
    favoritedByMe,
  };
}

// Allocates the next serial number for a module and creates the question in
// one transaction so concurrent creates never collide on (moduleId, serialNumber).
async function createQuestionWithSerial(tx, moduleId, data, userId, explicitSerial) {
  const module = await tx.module.findUnique({ where: { id: moduleId } });
  if (!module || module.isArchived) {
    const err = new Error('Module not found.');
    err.statusCode = 404;
    throw err;
  }

  let serialNumber = explicitSerial;
  if (serialNumber) {
    const clash = await tx.question.findUnique({
      where: { moduleId_serialNumber: { moduleId, serialNumber } },
    });
    if (clash) {
      const err = new Error(`Serial number ${serialNumber} already exists in this module.`);
      err.statusCode = 409;
      throw err;
    }
    if (serialNumber >= module.nextSerial) {
      await tx.module.update({ where: { id: moduleId }, data: { nextSerial: serialNumber + 1 } });
    }
  } else {
    serialNumber = module.nextSerial;
    await tx.module.update({ where: { id: moduleId }, data: { nextSerial: serialNumber + 1 } });
  }

  return tx.question.create({
    data: {
      moduleId,
      serialNumber,
      title: data.title,
      content: data.content,
      format: data.format,
      codeLanguage: data.format === 'TEXT' ? null : data.codeLanguage,
      answer: data.answer,
      difficulty: data.difficulty,
      tags: JSON.stringify(data.tags || []),
      createdById: userId,
    },
    include: { module: { select: { id: true, name: true } }, createdBy: { select: { username: true } } },
  });
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const querySchema = z.object({
      moduleId: z.string().optional(),
      difficulty: z.string().optional(),
      format: z.string().optional(),
      tag: z.string().optional(),
      q: z.string().optional(),
      createdBy: z.string().optional(),
      favoritesOnly: z.string().optional(),
      sort: z.enum(['newest', 'oldest', 'mostViewed', 'serial']).optional().default('serial'),
      page: z.coerce.number().int().positive().optional().default(1),
      pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
    });
    const q = validate(querySchema, req.query);

    const where = {};
    if (q.moduleId) where.moduleId = q.moduleId;
    if (q.difficulty) where.difficulty = q.difficulty;
    if (q.format) where.format = q.format;
    if (q.createdBy) where.createdById = q.createdBy;
    if (q.tag) where.tags = { contains: `"${q.tag}"` };
    if (q.q) {
      where.OR = [
        { title: { contains: q.q } },
        { content: { contains: q.q } },
        { answer: { contains: q.q } },
      ];
    }
    if (q.favoritesOnly === 'true') {
      where.favorites = { some: { userId: req.user.id } };
    }

    const orderBy = {
      newest: { createdAt: 'desc' },
      oldest: { createdAt: 'asc' },
      mostViewed: { viewCount: 'desc' },
      serial: { serialNumber: 'asc' },
    }[q.sort];

    const [total, questions, myFavorites] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          module: { select: { id: true, name: true } },
          createdBy: { select: { username: true } },
          _count: { select: { favorites: true } },
        },
      }),
      prisma.favorite.findMany({ where: { userId: req.user.id }, select: { questionId: true } }),
    ]);

    const favoriteSet = new Set(myFavorites.map((f) => f.questionId));

    res.json({
      total,
      page: q.page,
      pageSize: q.pageSize,
      questions: questions.map((qq) => serializeQuestion(qq, favoriteSet.has(qq.id))),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const question = await prisma.question.update({
      where: { id: req.params.id },
      data: { viewCount: { increment: 1 } },
      include: {
        module: { select: { id: true, name: true } },
        createdBy: { select: { username: true } },
        _count: { select: { favorites: true } },
      },
    }).catch(() => null);

    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const favorite = await prisma.favorite.findUnique({
      where: { userId_questionId: { userId: req.user.id, questionId: question.id } },
    });

    res.json({ question: serializeQuestion(question, !!favorite) });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const data = validate(questionCreateSchema, req.body);

    const question = await prisma.$transaction((tx) =>
      createQuestionWithSerial(tx, data.moduleId, data, req.user.id, data.serialNumber)
    );

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      targetId: question.id,
      details: { title: question.title, moduleId: question.moduleId, serialNumber: question.serialNumber },
      ipAddress: req.ip,
    });

    res.status(201).json({ question: serializeQuestion(question) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const data = validate(questionUpdateSchema, req.body);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    if (!canModify(req.user, existing)) {
      return res.status(403).json({ error: 'You do not have permission to edit this question.' });
    }

    const versionCount = await prisma.questionVersion.count({ where: { questionId: existing.id } });

    const { changeDescription, ...fields } = data;
    const updateData = { ...fields };
    if (fields.tags) updateData.tags = JSON.stringify(fields.tags);
    if (fields.format === 'TEXT') updateData.codeLanguage = null;

    const [, updated] = await prisma.$transaction([
      prisma.questionVersion.create({
        data: {
          questionId: existing.id,
          versionNumber: versionCount + 1,
          previousContent: JSON.stringify({
            title: existing.title,
            content: existing.content,
            format: existing.format,
            codeLanguage: existing.codeLanguage,
            answer: existing.answer,
            difficulty: existing.difficulty,
            tags: existing.tags,
          }),
          changedById: req.user.id,
          changeDescription: changeDescription || null,
        },
      }),
      prisma.question.update({
        where: { id: existing.id },
        data: updateData,
        include: { module: { select: { id: true, name: true } }, createdBy: { select: { username: true } } },
      }),
    ]);

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EDIT,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      targetId: existing.id,
      details: { changes: Object.keys(fields) },
      ipAddress: req.ip,
    });

    res.json({ question: serializeQuestion(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    if (!canModify(req.user, existing)) {
      return res.status(403).json({ error: 'You do not have permission to delete this question.' });
    }

    await prisma.question.delete({ where: { id: existing.id } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.DELETE,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      targetId: existing.id,
      details: { title: existing.title, moduleId: existing.moduleId, serialNumber: existing.serialNumber },
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/duplicate', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    const clone = await prisma.$transaction((tx) =>
      createQuestionWithSerial(
        tx,
        existing.moduleId,
        {
          title: `${existing.title} (Copy)`,
          content: existing.content,
          format: existing.format,
          codeLanguage: existing.codeLanguage,
          answer: existing.answer,
          difficulty: existing.difficulty,
          tags: JSON.parse(existing.tags || '[]'),
        },
        req.user.id,
        undefined
      )
    );

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      targetId: clone.id,
      details: { duplicatedFrom: existing.id },
      ipAddress: req.ip,
    });

    res.status(201).json({ question: serializeQuestion(clone) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const versions = await prisma.questionVersion.findMany({
      where: { questionId: req.params.id },
      orderBy: { versionNumber: 'desc' },
      include: { changedBy: { select: { username: true } } },
    });
    res.json({
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        previousContent: JSON.parse(v.previousContent),
        changedByUsername: v.changedBy ? v.changedBy.username : null,
        changeDescription: v.changeDescription,
        changedAt: v.changedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/versions/:versionId/rollback', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const version = await prisma.questionVersion.findUnique({ where: { id: req.params.versionId } });
    if (!version || version.questionId !== req.params.id) {
      return res.status(404).json({ error: 'Version not found.' });
    }
    const snapshot = JSON.parse(version.previousContent);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    const versionCount = await prisma.questionVersion.count({ where: { questionId: existing.id } });

    const [, updated] = await prisma.$transaction([
      prisma.questionVersion.create({
        data: {
          questionId: existing.id,
          versionNumber: versionCount + 1,
          previousContent: JSON.stringify({
            title: existing.title,
            content: existing.content,
            format: existing.format,
            codeLanguage: existing.codeLanguage,
            answer: existing.answer,
            difficulty: existing.difficulty,
            tags: existing.tags,
          }),
          changedById: req.user.id,
          changeDescription: `Rollback to version ${version.versionNumber}`,
        },
      }),
      prisma.question.update({ where: { id: existing.id }, data: snapshot }),
    ]);

    res.json({ question: serializeQuestion(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/favorite', authenticate, async (req, res, next) => {
  try {
    await prisma.favorite.upsert({
      where: { userId_questionId: { userId: req.user.id, questionId: req.params.id } },
      create: { userId: req.user.id, questionId: req.params.id },
      update: {},
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/favorite', authenticate, async (req, res, next) => {
  try {
    await prisma.favorite
      .delete({ where: { userId_questionId: { userId: req.user.id, questionId: req.params.id } } })
      .catch(() => null);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const bulkActionSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['delete', 'setDifficulty', 'addTag', 'moveModule']),
  difficulty: z.string().optional(),
  tag: z.string().optional(),
  moduleId: z.string().optional(),
});

router.post('/bulk', authenticate, requireWriterOrAdmin, async (req, res, next) => {
  try {
    const data = validate(bulkActionSchema, req.body);

    if (data.action === 'delete') {
      const result = await prisma.question.deleteMany({ where: { id: { in: data.questionIds } } });
      await recordAudit({
        userId: req.user.id,
        action: AUDIT_ACTIONS.DELETE,
        targetType: AUDIT_TARGET_TYPES.QUESTION,
        details: { bulk: true, count: result.count },
        ipAddress: req.ip,
      });
      return res.json({ updated: result.count });
    }

    if (data.action === 'setDifficulty') {
      if (!data.difficulty) return res.status(400).json({ error: 'difficulty is required.' });
      const result = await prisma.question.updateMany({
        where: { id: { in: data.questionIds } },
        data: { difficulty: data.difficulty },
      });
      return res.json({ updated: result.count });
    }

    if (data.action === 'addTag') {
      if (!data.tag) return res.status(400).json({ error: 'tag is required.' });
      const questions = await prisma.question.findMany({ where: { id: { in: data.questionIds } } });
      await prisma.$transaction(
        questions.map((qn) => {
          const tags = new Set(JSON.parse(qn.tags || '[]'));
          tags.add(data.tag);
          return prisma.question.update({ where: { id: qn.id }, data: { tags: JSON.stringify([...tags]) } });
        })
      );
      return res.json({ updated: questions.length });
    }

    if (data.action === 'moveModule') {
      if (!data.moduleId) return res.status(400).json({ error: 'moduleId is required.' });
      const targetModule = await prisma.module.findUnique({ where: { id: data.moduleId } });
      if (!targetModule || targetModule.isArchived) return res.status(404).json({ error: 'Target module not found.' });

      const questions = await prisma.question.findMany({ where: { id: { in: data.questionIds } } });
      await prisma.$transaction(async (tx) => {
        for (const qn of questions) {
          const mod = await tx.module.findUnique({ where: { id: targetModule.id } });
          const serialNumber = mod.nextSerial;
          await tx.module.update({ where: { id: targetModule.id }, data: { nextSerial: serialNumber + 1 } });
          await tx.question.update({ where: { id: qn.id }, data: { moduleId: targetModule.id, serialNumber } });
        }
      });
      return res.json({ updated: questions.length });
    }

    res.status(400).json({ error: 'Unsupported bulk action.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
