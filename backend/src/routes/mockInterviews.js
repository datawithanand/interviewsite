const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const { getDescendantIds } = require('../utils/nodeHelpers');
const { computeNextReview, deriveStatus } = require('../utils/spacedRepetition');
const { awardXp, evaluateBadges } = require('../utils/gamification');

const router = express.Router();
router.use(authenticate);

const SELF_RATINGS = ['CORRECT', 'PARTIAL', 'INCORRECT', 'SKIPPED'];
const RATING_WEIGHT = { CORRECT: 1, PARTIAL: 0.5, INCORRECT: 0, SKIPPED: 0 };
// A mock-interview self-rating maps onto the same spaced-repetition scale
// used by the flashcard Practice flow, so answering in a mock interview
// also advances that question's review schedule.
const RATING_TO_SR = { CORRECT: 'GOOD', PARTIAL: 'HARD', INCORRECT: 'AGAIN' };

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

function serializeSession(session, questions, answers) {
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const elapsedMs = Date.now() - new Date(session.startedAt).getTime();
  const remainingSeconds = Math.max(0, session.durationMinutes * 60 - Math.floor(elapsedMs / 1000));

  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    durationMinutes: session.durationMinutes,
    remainingSeconds: session.status === 'IN_PROGRESS' ? remainingSeconds : 0,
    score: session.score,
    xpEarned: session.xpEarned,
    questions: questions.map((q) => ({
      ...serializeQuestionBrief(q),
      answer: answerMap.has(q.id)
        ? { selfRating: answerMap.get(q.id).selfRating, timeSpentSeconds: answerMap.get(q.id).timeSpentSeconds }
        : null,
    })),
  };
}

const startSchema = z.object({
  nodeIds: z.array(z.string().min(1)).max(50).optional().default([]),
  difficulty: z.string().optional(),
  count: z.coerce.number().int().min(1).max(50).optional().default(10),
  durationMinutes: z.coerce.number().int().min(1).max(240).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const data = validate(startSchema, req.body);

    let nodeIdFilter;
    if (data.nodeIds.length > 0) {
      const descendantSets = await Promise.all(data.nodeIds.map((id) => getDescendantIds(id)));
      nodeIdFilter = [...new Set(descendantSets.flat())];
    }

    const where = { node: { isArchived: false } };
    if (nodeIdFilter) where.nodeId = { in: nodeIdFilter };
    if (data.difficulty) where.difficulty = data.difficulty;

    const pool = await prisma.question.findMany({ where, select: { id: true } });
    if (pool.length === 0) {
      return res.status(400).json({ error: 'No questions match the chosen scope.' });
    }

    const selectedIds = shuffle(pool.map((q) => q.id)).slice(0, data.count);
    const durationMinutes = data.durationMinutes || Math.max(5, selectedIds.length * 2);

    const session = await prisma.mockInterview.create({
      data: {
        userId: req.user.id,
        nodeScope: JSON.stringify(data.nodeIds),
        difficulty: data.difficulty || null,
        durationMinutes,
        questionIds: JSON.stringify(selectedIds),
      },
    });

    const questions = await prisma.question.findMany({
      where: { id: { in: selectedIds } },
      include: { node: { select: { id: true, name: true } } },
    });
    const ordered = selectedIds.map((id) => questions.find((q) => q.id === id)).filter(Boolean);

    res.status(201).json({ session: serializeSession(session, ordered, []) });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const sessions = await prisma.mockInterview.findMany({
      where: { userId: req.user.id, status: { in: ['COMPLETED', 'ABANDONED'] } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        durationMinutes: s.durationMinutes,
        questionCount: JSON.parse(s.questionIds || '[]').length,
        score: s.score,
        xpEarned: s.xpEarned,
      })),
    });
  } catch (err) {
    next(err);
  }
});

async function loadOwnedSession(req, res) {
  const session = await prisma.mockInterview.findUnique({ where: { id: req.params.id } });
  if (!session || session.userId !== req.user.id) {
    res.status(404).json({ error: 'Mock interview session not found.' });
    return null;
  }
  return session;
}

router.get('/:id', async (req, res, next) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;

    const ids = JSON.parse(session.questionIds || '[]');
    const [questions, answers] = await Promise.all([
      prisma.question.findMany({ where: { id: { in: ids } }, include: { node: { select: { id: true, name: true } } } }),
      prisma.mockInterviewAnswer.findMany({ where: { sessionId: session.id } }),
    ]);
    const ordered = ids.map((id) => questions.find((q) => q.id === id)).filter(Boolean);

    res.json({ session: serializeSession(session, ordered, answers) });
  } catch (err) {
    next(err);
  }
});

const answerSchema = z.object({
  questionId: z.string().min(1),
  selfRating: z.enum(SELF_RATINGS),
  timeSpentSeconds: z.coerce.number().int().min(0).max(3600).optional().default(0),
});

router.post('/:id/answer', async (req, res, next) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;
    if (session.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'This mock interview has already finished.' });
    }

    const data = validate(answerSchema, req.body);
    const questionIds = JSON.parse(session.questionIds || '[]');
    const order = questionIds.indexOf(data.questionId);
    if (order === -1) {
      return res.status(400).json({ error: 'That question is not part of this session.' });
    }

    const answer = await prisma.mockInterviewAnswer.upsert({
      where: { sessionId_questionId: { sessionId: session.id, questionId: data.questionId } },
      create: {
        sessionId: session.id,
        questionId: data.questionId,
        order,
        selfRating: data.selfRating,
        timeSpentSeconds: data.timeSpentSeconds,
        answeredAt: new Date(),
      },
      update: { selfRating: data.selfRating, timeSpentSeconds: data.timeSpentSeconds, answeredAt: new Date() },
    });

    res.json({ answer: { questionId: answer.questionId, selfRating: answer.selfRating, timeSpentSeconds: answer.timeSpentSeconds } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/finish', async (req, res, next) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;
    if (session.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'This mock interview has already finished.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const questionIds = JSON.parse(session.questionIds || '[]');
      const answers = await tx.mockInterviewAnswer.findMany({ where: { sessionId: session.id } });
      const answerMap = new Map(answers.map((a) => [a.questionId, a]));

      let weightedSum = 0;
      let correctCount = 0;
      let partialCount = 0;
      let incorrectCount = 0;
      let skippedCount = 0;

      for (const qid of questionIds) {
        const a = answerMap.get(qid);
        const rating = a?.selfRating || 'SKIPPED';
        weightedSum += RATING_WEIGHT[rating];
        if (rating === 'CORRECT') correctCount += 1;
        else if (rating === 'PARTIAL') partialCount += 1;
        else if (rating === 'INCORRECT') incorrectCount += 1;
        else skippedCount += 1;

        const srRating = RATING_TO_SR[rating];
        if (srRating) {
          // eslint-disable-next-line no-await-in-loop
          const existing = await tx.questionProgress.findUnique({
            where: { userId_questionId: { userId: req.user.id, questionId: qid } },
          });
          const base = existing || { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
          const next = computeNextReview(base, srRating);
          const isCorrect = srRating !== 'AGAIN';
          const correctStreak = isCorrect ? (existing?.correctStreak || 0) + 1 : 0;
          const totalReviews = (existing?.totalReviews || 0) + 1;
          const totalCorrect = (existing?.totalCorrect || 0) + (isCorrect ? 1 : 0);
          const status = deriveStatus({ repetitions: next.repetitions, intervalDays: next.intervalDays, correctStreak });

          // eslint-disable-next-line no-await-in-loop
          await tx.questionProgress.upsert({
            where: { userId_questionId: { userId: req.user.id, questionId: qid } },
            create: {
              userId: req.user.id,
              questionId: qid,
              easeFactor: next.easeFactor,
              intervalDays: next.intervalDays,
              repetitions: next.repetitions,
              correctStreak,
              totalReviews,
              totalCorrect,
              status,
              lastReviewedAt: new Date(),
              nextReviewAt: next.nextReviewAt,
            },
            update: {
              easeFactor: next.easeFactor,
              intervalDays: next.intervalDays,
              repetitions: next.repetitions,
              correctStreak,
              totalReviews,
              totalCorrect,
              status,
              lastReviewedAt: new Date(),
              nextReviewAt: next.nextReviewAt,
            },
          });
        }
      }

      const score = questionIds.length > 0 ? Math.round((weightedSum / questionIds.length) * 100) : 0;
      const xpEarned = 20 + correctCount * 3 + partialCount * 1;

      const updatedSession = await tx.mockInterview.update({
        where: { id: session.id },
        data: { status: 'COMPLETED', finishedAt: new Date(), score, xpEarned },
      });

      const gameStats = await awardXp(tx, req.user.id, xpEarned);
      const newBadges = await evaluateBadges(tx, req.user.id);

      return { session: updatedSession, score, xpEarned, correctCount, partialCount, incorrectCount, skippedCount, gameStats, newBadges };
    });

    res.json({
      score: result.score,
      xpEarned: result.xpEarned,
      correctCount: result.correctCount,
      partialCount: result.partialCount,
      incorrectCount: result.incorrectCount,
      skippedCount: result.skippedCount,
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

module.exports = router;
