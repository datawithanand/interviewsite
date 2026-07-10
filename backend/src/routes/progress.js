const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const { computeNextReview, deriveStatus, RATINGS } = require('../utils/spacedRepetition');
const { awardXp, evaluateBadges } = require('../utils/gamification');
const { BADGES } = require('../utils/badges');

const router = express.Router();
router.use(authenticate);

const XP_BY_RATING = { AGAIN: 2, HARD: 5, GOOD: 8, EASY: 10 };

function serializeQuestionBrief(q) {
  return {
    id: q.id,
    title: q.title,
    questionText: q.questionText,
    questionCode: q.questionCode,
    answerText: q.answerText,
    answerCode: q.answerCode,
    format: q.format,
    codeLanguage: q.codeLanguage,
    difficulty: q.difficulty,
    node: q.node ? { id: q.node.id, name: q.node.name } : undefined,
  };
}

// Resolves the top-level ancestor ("Technology") name for every node id,
// using one bulk fetch + in-memory parent walk (same approach as stats.js).
async function buildTechnologyLookup() {
  const allNodes = await prisma.node.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const cache = new Map();
  return function rootNameOf(nodeId) {
    if (cache.has(nodeId)) return cache.get(nodeId);
    let current = byId.get(nodeId);
    const visited = new Set();
    while (current && current.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
    const name = current ? current.name : 'Unknown';
    cache.set(nodeId, name);
    return name;
  };
}

// GET /progress/queue — questions due for review, then fresh (never-reviewed)
// questions to top up the session if there's room left.
router.get('/queue', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const due = await prisma.questionProgress.findMany({
      where: { userId: req.user.id, nextReviewAt: { lte: new Date() } },
      orderBy: { nextReviewAt: 'asc' },
      take: limit,
      include: { question: { include: { node: { select: { id: true, name: true } } } } },
    });

    const dueQuestions = due
      .filter((p) => p.question)
      .map((p) => ({ ...serializeQuestionBrief(p.question), progress: serializeProgress(p) }));

    const remaining = limit - dueQuestions.length;
    let freshQuestions = [];
    if (remaining > 0) {
      const reviewedIds = (
        await prisma.questionProgress.findMany({ where: { userId: req.user.id }, select: { questionId: true } })
      ).map((p) => p.questionId);

      const fresh = await prisma.question.findMany({
        where: { id: { notIn: reviewedIds }, node: { isArchived: false } },
        orderBy: { createdAt: 'asc' },
        take: remaining,
        include: { node: { select: { id: true, name: true } } },
      });
      freshQuestions = fresh.map((q) => ({ ...serializeQuestionBrief(q), progress: null }));
    }

    res.json({ queue: [...dueQuestions, ...freshQuestions], dueCount: due.length });
  } catch (err) {
    next(err);
  }
});

function serializeProgress(p) {
  return {
    status: p.status,
    repetitions: p.repetitions,
    correctStreak: p.correctStreak,
    totalReviews: p.totalReviews,
    totalCorrect: p.totalCorrect,
    lastReviewedAt: p.lastReviewedAt,
    nextReviewAt: p.nextReviewAt,
  };
}

const reviewSchema = z.object({ rating: z.enum(RATINGS) });

// POST /progress/:questionId/review — record a self-rating for a question,
// advance its spaced-repetition schedule, award XP, and check badges.
router.post('/:questionId/review', async (req, res, next) => {
  try {
    const { rating } = validate(reviewSchema, req.body);

    const question = await prisma.question.findUnique({ where: { id: req.params.questionId } });
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.questionProgress.findUnique({
        where: { userId_questionId: { userId: req.user.id, questionId: question.id } },
      });

      const base = existing || { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
      const { easeFactor, intervalDays, repetitions, nextReviewAt } = computeNextReview(base, rating);
      const isCorrect = rating !== 'AGAIN';
      const correctStreak = isCorrect ? (existing?.correctStreak || 0) + 1 : 0;
      const totalReviews = (existing?.totalReviews || 0) + 1;
      const totalCorrect = (existing?.totalCorrect || 0) + (isCorrect ? 1 : 0);
      const status = deriveStatus({ repetitions, intervalDays, correctStreak });

      const progress = await tx.questionProgress.upsert({
        where: { userId_questionId: { userId: req.user.id, questionId: question.id } },
        create: {
          userId: req.user.id,
          questionId: question.id,
          easeFactor,
          intervalDays,
          repetitions,
          correctStreak,
          totalReviews,
          totalCorrect,
          status,
          lastReviewedAt: new Date(),
          nextReviewAt,
        },
        update: { easeFactor, intervalDays, repetitions, correctStreak, totalReviews, totalCorrect, status, lastReviewedAt: new Date(), nextReviewAt },
      });

      const xpAmount = XP_BY_RATING[rating];
      const gameStats = await awardXp(tx, req.user.id, xpAmount);
      const newBadges = await evaluateBadges(tx, req.user.id);

      return { progress, xpAmount, gameStats, newBadges };
    });

    res.json({
      progress: serializeProgress(result.progress),
      xpEarned: result.xpAmount,
      gameStats: {
        xp: result.gameStats.xp,
        level: result.gameStats.level,
        currentStreak: result.gameStats.currentStreak,
        longestStreak: result.gameStats.longestStreak,
      },
      newBadges: result.newBadges,
    });
  } catch (err) {
    next(err);
  }
});

// GET /progress/summary — dashboard payload: xp/level/streak, mastery
// counts, and per-technology accuracy ("weak areas").
router.get('/summary', async (req, res, next) => {
  try {
    const [gameStats, byStatus, totalQuestions, progressRows] = await Promise.all([
      prisma.userGameStats.findUnique({ where: { userId: req.user.id } }),
      prisma.questionProgress.groupBy({ by: ['status'], where: { userId: req.user.id }, _count: true }),
      prisma.question.count({ where: { node: { isArchived: false } } }),
      prisma.questionProgress.findMany({
        where: { userId: req.user.id },
        select: { totalReviews: true, totalCorrect: true, status: true, question: { select: { nodeId: true } } },
      }),
    ]);

    const rootNameOf = await buildTechnologyLookup();
    const byTechnology = new Map();
    for (const row of progressRows) {
      if (!row.question) continue;
      const tech = rootNameOf(row.question.nodeId);
      const agg = byTechnology.get(tech) || { technology: tech, attempted: 0, mastered: 0, totalReviews: 0, totalCorrect: 0 };
      agg.attempted += 1;
      if (row.status === 'MASTERED') agg.mastered += 1;
      agg.totalReviews += row.totalReviews;
      agg.totalCorrect += row.totalCorrect;
      byTechnology.set(tech, agg);
    }

    const weakAreas = [...byTechnology.values()]
      .map((t) => ({
        technology: t.technology,
        attempted: t.attempted,
        mastered: t.mastered,
        accuracy: t.totalReviews > 0 ? Math.round((t.totalCorrect / t.totalReviews) * 100) : 0,
      }))
      .filter((t) => t.attempted >= 2)
      .sort((a, b) => a.accuracy - b.accuracy);

    const statusCounts = { NEW: 0, LEARNING: 0, REVIEWING: 0, MASTERED: 0 };
    for (const s of byStatus) statusCounts[s.status] = s._count;

    res.json({
      gameStats: gameStats
        ? { xp: gameStats.xp, level: gameStats.level, currentStreak: gameStats.currentStreak, longestStreak: gameStats.longestStreak }
        : { xp: 0, level: 1, currentStreak: 0, longestStreak: 0 },
      totalQuestions,
      questionsAttempted: progressRows.length,
      statusCounts,
      weakAreas,
      strongAreas: [...weakAreas].reverse().slice(0, 3),
    });
  } catch (err) {
    next(err);
  }
});

// GET /progress/badges — full catalog with earned/unearned state.
router.get('/badges', async (req, res, next) => {
  try {
    const earned = await prisma.userBadge.findMany({ where: { userId: req.user.id } });
    const earnedMap = new Map(earned.map((b) => [b.code, b.earnedAt]));

    const badges = Object.entries(BADGES).map(([code, def]) => ({
      code,
      ...def,
      earned: earnedMap.has(code),
      earnedAt: earnedMap.get(code) || null,
    }));

    res.json({ badges });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
