const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireContentManagerOrAdmin } = require('../middleware/rbac');
const { validate, questionCreateSchema, questionUpdateSchema, hasRequiredFieldsForFormat } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, ROLES, NOTIFICATION_TYPES } = require('../utils/enums');
const { notify } = require('../utils/notify');
const { hasActiveChildren } = require('../utils/nodeHelpers');

const router = express.Router();

function canModify(user) {
  return user.role === ROLES.ADMIN || user.role === ROLES.CONTENT_MANAGER;
}

const VERSIONED_FIELDS = ['title', 'questionText', 'questionCode', 'answerText', 'answerCode', 'format', 'codeLanguage', 'difficulty', 'tags'];

function snapshotOf(question) {
  const snap = {};
  for (const key of VERSIONED_FIELDS) snap[key] = question[key];
  return snap;
}

function serializeQuestion(q, favoritedByMe = false) {
  return {
    id: q.id,
    nodeId: q.nodeId,
    node: q.node ? { id: q.node.id, name: q.node.name } : undefined,
    serialNumber: q.serialNumber,
    title: q.title,
    questionText: q.questionText,
    questionCode: q.questionCode,
    answerText: q.answerText,
    answerCode: q.answerCode,
    format: q.format,
    codeLanguage: q.codeLanguage,
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

// Allocates the next serial number for a node and creates the question in
// one transaction so concurrent creates never collide on (nodeId, serialNumber).
// Questions may only attach to leaf nodes (nodes with no active children).
async function createQuestionWithSerial(tx, nodeId, data, userId, explicitSerial) {
  const node = await tx.node.findUnique({ where: { id: nodeId } });
  if (!node || node.isArchived) {
    const err = new Error('Node not found.');
    err.statusCode = 404;
    throw err;
  }

  const childCount = await tx.node.count({ where: { parentId: nodeId, isArchived: false } });
  if (childCount > 0) {
    const err = new Error('Questions can only be attached to a leaf node (one with no submodules).');
    err.statusCode = 400;
    throw err;
  }

  let serialNumber = explicitSerial;
  if (serialNumber) {
    const clash = await tx.question.findUnique({
      where: { nodeId_serialNumber: { nodeId, serialNumber } },
    });
    if (clash) {
      const err = new Error(`Serial number ${serialNumber} already exists for this node.`);
      err.statusCode = 409;
      throw err;
    }
    if (serialNumber >= node.nextSerial) {
      await tx.node.update({ where: { id: nodeId }, data: { nextSerial: serialNumber + 1 } });
    }
  } else {
    serialNumber = node.nextSerial;
    await tx.node.update({ where: { id: nodeId }, data: { nextSerial: serialNumber + 1 } });
  }

  const format = data.format === 'TEXT' ? 'TEXT' : data.format;
  // The question itself lives in `title` for every format. TEXT only adds
  // a separate Answer (questionText is unused for TEXT); CODE and BOTH
  // hold their whole solution in the Question fields, so answerText/
  // answerCode are never populated for them.
  return tx.question.create({
    data: {
      nodeId,
      serialNumber,
      title: data.title,
      questionText: format === 'BOTH' ? data.questionText || null : null,
      questionCode: format === 'TEXT' ? null : data.questionCode || null,
      answerText: format === 'TEXT' ? data.answerText || null : null,
      answerCode: null,
      format,
      codeLanguage: format === 'TEXT' ? null : data.codeLanguage,
      difficulty: data.difficulty,
      tags: JSON.stringify(data.tags || []),
      createdById: userId,
    },
    include: { node: { select: { id: true, name: true } }, createdBy: { select: { username: true } } },
  });
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const querySchema = z.object({
      nodeId: z.string().optional(),
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

    const where = { node: { isArchived: false } };
    if (q.nodeId) where.nodeId = q.nodeId;
    if (q.difficulty) where.difficulty = q.difficulty;
    if (q.format) where.format = q.format;
    if (q.createdBy) where.createdById = q.createdBy;
    if (q.tag) where.tags = { contains: `"${q.tag}"` };
    if (q.q) {
      where.OR = [
        { title: { contains: q.q } },
        { questionText: { contains: q.q } },
        { questionCode: { contains: q.q } },
        { answerText: { contains: q.q } },
        { answerCode: { contains: q.q } },
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
          node: { select: { id: true, name: true } },
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
        node: { select: { id: true, name: true } },
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

router.post('/', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const data = validate(questionCreateSchema, req.body);

    const question = await prisma.$transaction((tx) =>
      createQuestionWithSerial(tx, data.nodeId, data, req.user.id, data.serialNumber)
    );

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      targetId: question.id,
      details: { title: question.title, nodeId: question.nodeId, serialNumber: question.serialNumber },
      ipAddress: req.ip,
    });

    res.status(201).json({ question: serializeQuestion(question) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const data = validate(questionUpdateSchema, req.body);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    if (!canModify(req.user)) {
      return res.status(403).json({ error: 'You do not have permission to edit this question.' });
    }

    const { changeDescription, ...fields } = data;

    // Merge onto the existing row to validate the *resulting* question
    // satisfies its (possibly newly-selected) format's field requirements.
    const merged = { ...existing, ...fields };
    if (!hasRequiredFieldsForFormat(merged)) {
      return res.status(400).json({ error: 'Provide the Text/Code fields required for the selected format (both Question and Answer).' });
    }
    if (merged.format !== 'TEXT' && !merged.codeLanguage) {
      return res.status(400).json({ error: 'codeLanguage is required when format is CODE or BOTH.' });
    }

    const versionCount = await prisma.questionVersion.count({ where: { questionId: existing.id } });

    const updateData = { ...fields };
    if (fields.tags) updateData.tags = JSON.stringify(fields.tags);
    // Only keep the fields relevant to the (possibly newly-selected) format.
    // The question itself always lives in `title`. TEXT only adds a
    // separate Answer (questionText is unused for TEXT); CODE and BOTH
    // hold their whole solution in the Question fields, so answerText/
    // answerCode are always cleared outside of TEXT.
    if (merged.format === 'TEXT') {
      updateData.questionText = null;
      updateData.questionCode = null;
      updateData.answerCode = null;
      updateData.codeLanguage = null;
    } else if (merged.format === 'CODE') {
      updateData.questionText = null;
      updateData.answerText = null;
      updateData.answerCode = null;
    } else if (merged.format === 'BOTH') {
      updateData.answerText = null;
      updateData.answerCode = null;
    }

    const [, updated] = await prisma.$transaction([
      prisma.questionVersion.create({
        data: {
          questionId: existing.id,
          versionNumber: versionCount + 1,
          previousContent: JSON.stringify(snapshotOf(existing)),
          changedById: req.user.id,
          changeDescription: changeDescription || null,
        },
      }),
      prisma.question.update({
        where: { id: existing.id },
        data: updateData,
        include: { node: { select: { id: true, name: true } }, createdBy: { select: { username: true } } },
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

    if (existing.createdById) {
      await notify({
        userId: existing.createdById,
        actorId: req.user.id,
        type: NOTIFICATION_TYPES.QUESTION_EDITED,
        message: `${req.user.username} edited your question "${existing.title}".`,
        relatedQuestionId: existing.id,
        relatedNodeId: existing.nodeId,
      });
    }

    res.json({ question: serializeQuestion(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    if (!canModify(req.user)) {
      return res.status(403).json({ error: 'You do not have permission to delete this question.' });
    }

    await prisma.question.delete({ where: { id: existing.id } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.DELETE,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      targetId: existing.id,
      details: { title: existing.title, nodeId: existing.nodeId, serialNumber: existing.serialNumber },
      ipAddress: req.ip,
    });

    if (existing.createdById) {
      await notify({
        userId: existing.createdById,
        actorId: req.user.id,
        type: NOTIFICATION_TYPES.QUESTION_DELETED,
        message: `${req.user.username} deleted your question "${existing.title}".`,
        relatedNodeId: existing.nodeId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/duplicate', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Question not found.' });

    const clone = await prisma.$transaction((tx) =>
      createQuestionWithSerial(
        tx,
        existing.nodeId,
        {
          title: `${existing.title} (Copy)`,
          questionText: existing.questionText,
          questionCode: existing.questionCode,
          answerText: existing.answerText,
          answerCode: existing.answerCode,
          format: existing.format,
          codeLanguage: existing.codeLanguage,
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

router.post('/:id/versions/:versionId/rollback', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
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
          previousContent: JSON.stringify(snapshotOf(existing)),
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
  action: z.enum(['delete', 'setDifficulty', 'addTag', 'moveNode']),
  difficulty: z.string().optional(),
  tag: z.string().optional(),
  nodeId: z.string().optional(),
});

router.post('/bulk', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
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

    if (data.action === 'moveNode') {
      if (!data.nodeId) return res.status(400).json({ error: 'nodeId is required.' });
      const targetNode = await prisma.node.findUnique({ where: { id: data.nodeId } });
      if (!targetNode || targetNode.isArchived) return res.status(404).json({ error: 'Target node not found.' });
      if (await hasActiveChildren(targetNode.id)) {
        return res.status(400).json({ error: 'Target node is not a leaf (it has submodules); questions cannot attach here.' });
      }

      const questions = await prisma.question.findMany({ where: { id: { in: data.questionIds } } });
      await prisma.$transaction(async (tx) => {
        for (const qn of questions) {
          const node = await tx.node.findUnique({ where: { id: targetNode.id } });
          const serialNumber = node.nextSerial;
          await tx.node.update({ where: { id: targetNode.id }, data: { nextSerial: serialNumber + 1 } });
          await tx.question.update({ where: { id: qn.id }, data: { nodeId: targetNode.id, serialNumber } });
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
