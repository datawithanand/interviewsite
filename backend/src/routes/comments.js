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

function serializeComment(c, userId) {
  return {
    id: c.id,
    questionId: c.questionId,
    userId: c.userId,
    username: c.user ? c.user.username : 'deleted user',
    content: c.content,
    isPinned: c.isPinned,
    parentId: c.parentId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    likeCount: c.likes ? c.likes.length : 0,
    likedByMe: c.likes ? c.likes.some((l) => l.userId === userId) : false,
    likedByUsernames: c.likes ? c.likes.map((l) => (l.user ? l.user.username : 'deleted user')) : [],
  };
}

const COMMENT_INCLUDE = {
  user: { select: { username: true } },
  likes: { include: { user: { select: { username: true } } } },
};

router.get('/questions/:questionId/comments', async (req, res, next) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { questionId: req.params.questionId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
      include: COMMENT_INCLUDE,
    });
    res.json({ comments: comments.map((c) => serializeComment(c, req.user.id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/questions/:questionId/comments', async (req, res, next) => {
  try {
    const schema = z.object({ content: z.string().trim().min(1).max(2000), parentId: z.string().min(1).optional() });
    const data = validate(schema, req.body);

    const question = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    if (data.parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.questionId !== question.id) {
        return res.status(400).json({ error: 'Parent comment not found on this question.' });
      }
    }

    const comment = await prisma.comment.create({
      data: { questionId: question.id, userId: req.user.id, content: data.content, parentId: data.parentId || null },
      include: COMMENT_INCLUDE,
    });

    if (question.createdById) {
      await notify({
        userId: question.createdById,
        actorId: req.user.id,
        type: NOTIFICATION_TYPES.NEW_COMMENT,
        message: `${req.user.username} commented on your question "${question.title}".`,
        relatedQuestionId: question.id,
        relatedNodeId: question.nodeId,
      });
    }

    res.status(201).json({ comment: serializeComment(comment, req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/comments/:id/like', async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const existing = await prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId: comment.id, userId: req.user.id } },
    });

    if (existing) {
      await prisma.commentLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.commentLike.create({ data: { commentId: comment.id, userId: req.user.id } });
    }

    const updated = await prisma.comment.findUnique({ where: { id: comment.id }, include: COMMENT_INCLUDE });
    res.json({ comment: serializeComment(updated, req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/comments/:id', async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const canDelete =
      comment.userId === req.user.id || req.user.role === ROLES.ADMIN || req.user.role === ROLES.CONTENT_MANAGER;
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
      include: COMMENT_INCLUDE,
    });

    res.json({ comment: serializeComment(updated, req.user.id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
