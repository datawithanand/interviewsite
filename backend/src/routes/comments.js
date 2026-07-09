const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate } = require('../utils/validation');
const { notify } = require('../utils/notify');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, NOTIFICATION_TYPES, ROLES } = require('../utils/enums');

const router = express.Router();

router.use(authenticate);

function serializeComment(c) {
  return {
    id: c.id,
    questionId: c.questionId,
    userId: c.userId,
    username: c.user ? c.user.username : 'deleted user',
    content: c.content,
    isPinned: c.isPinned,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get('/questions/:questionId/comments', async (req, res, next) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { questionId: req.params.questionId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
      include: { user: { select: { username: true } } },
    });
    res.json({ comments: comments.map(serializeComment) });
  } catch (err) {
    next(err);
  }
});

router.post('/questions/:questionId/comments', async (req, res, next) => {
  try {
    const schema = z.object({ content: z.string().trim().min(1).max(2000) });
    const data = validate(schema, req.body);

    const question = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const comment = await prisma.comment.create({
      data: { questionId: question.id, userId: req.user.id, content: data.content },
      include: { user: { select: { username: true } } },
    });

    if (question.createdById) {
      await notify({
        userId: question.createdById,
        actorId: req.user.id,
        type: NOTIFICATION_TYPES.NEW_COMMENT,
        message: `${req.user.username} commented on your question "${question.title}".`,
        relatedQuestionId: question.id,
        relatedModuleId: question.moduleId,
      });
    }

    res.status(201).json({ comment: serializeComment(comment) });
  } catch (err) {
    next(err);
  }
});

router.delete('/comments/:id', async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const canDelete = comment.userId === req.user.id || req.user.role === ROLES.ADMIN;
    if (!canDelete) return res.status(403).json({ error: 'You do not have permission to delete this comment.' });

    await prisma.comment.delete({ where: { id: comment.id } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.DELETE,
      targetType: AUDIT_TARGET_TYPES.COMMENT,
      targetId: comment.id,
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.patch('/comments/:id/pin', requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({ isPinned: z.boolean() });
    const data = validate(schema, req.body);

    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data: { isPinned: data.isPinned },
      include: { user: { select: { username: true } } },
    });

    res.json({ comment: serializeComment(updated) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
