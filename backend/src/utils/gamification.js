const prisma = require('../db');
const { BADGES } = require('./badges');

function todayUtc() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function levelForXp(xp) {
  return Math.floor(xp / 100) + 1;
}

// Awards `xpAmount` to a user inside `tx`, growing/resetting their daily
// streak (at most once per calendar day, UTC), and returns the updated
// stats row. Call this from any XP-earning action (a review, finishing a
// mock interview).
async function awardXp(tx, userId, xpAmount) {
  const existing = await tx.userGameStats.findUnique({ where: { userId } });
  const today = todayUtc();

  let currentStreak = existing?.currentStreak || 0;
  let longestStreak = existing?.longestStreak || 0;
  const lastDate = existing?.lastActivityDate;

  if (lastDate !== today) {
    if (lastDate) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      currentStreak = lastDate === yesterday ? currentStreak + 1 : 1;
    } else {
      currentStreak = 1;
    }
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  const newXp = (existing?.xp || 0) + xpAmount;

  return tx.userGameStats.upsert({
    where: { userId },
    create: {
      userId,
      xp: newXp,
      level: levelForXp(newXp),
      currentStreak,
      longestStreak,
      lastActivityDate: today,
    },
    update: {
      xp: newXp,
      level: levelForXp(newXp),
      currentStreak,
      longestStreak,
      lastActivityDate: today,
    },
  });
}

// Checks badge criteria against a user's current stats and awards any
// newly-earned ones. Safe to call after every review / mock-interview
// completion; already-earned badges are skipped via a unique constraint.
async function evaluateBadges(tx, userId) {
  const [stats, progressAgg, masteredCount, mockCount, perfectMock] = await Promise.all([
    tx.userGameStats.findUnique({ where: { userId } }),
    tx.questionProgress.aggregate({ where: { userId }, _sum: { totalReviews: true } }),
    tx.questionProgress.count({ where: { userId, status: 'MASTERED' } }),
    tx.mockInterview.count({ where: { userId, status: 'COMPLETED' } }),
    tx.mockInterview.count({ where: { userId, status: 'COMPLETED', score: 100 } }),
  ]);

  const totalReviews = progressAgg._sum.totalReviews || 0;
  const earned = [];

  const maybeAward = (code, condition) => {
    if (condition) earned.push(code);
  };

  maybeAward('FIRST_STEPS', totalReviews >= 1);
  maybeAward('REVIEWS_50', totalReviews >= 50);
  maybeAward('REVIEWS_200', totalReviews >= 200);
  maybeAward('MASTERED_10', masteredCount >= 10);
  maybeAward('MASTERED_50', masteredCount >= 50);
  maybeAward('MASTERED_100', masteredCount >= 100);
  maybeAward('MOCK_ROOKIE', mockCount >= 1);
  maybeAward('MOCK_VETERAN', mockCount >= 10);
  maybeAward('MOCK_PERFECT', perfectMock >= 1);
  if (stats) {
    maybeAward('STREAK_3', stats.currentStreak >= 3);
    maybeAward('STREAK_7', stats.currentStreak >= 7);
    maybeAward('STREAK_30', stats.currentStreak >= 30);
    maybeAward('LEVEL_5', stats.level >= 5);
    maybeAward('LEVEL_10', stats.level >= 10);
  }

  if (earned.length === 0) return [];

  // SQLite's Prisma connector doesn't support `skipDuplicates` on
  // createMany, so newly-earned badges are filtered against what the user
  // already has before inserting.
  const existing = await tx.userBadge.findMany({ where: { userId, code: { in: earned } }, select: { code: true } });
  const existingCodes = new Set(existing.map((b) => b.code));
  const newCodes = earned.filter((code) => !existingCodes.has(code));

  if (newCodes.length === 0) return [];

  await tx.userBadge.createMany({ data: newCodes.map((code) => ({ userId, code })) });

  return newCodes.map((code) => ({ code, ...BADGES[code] }));
}

module.exports = { levelForXp, awardXp, evaluateBadges, todayUtc };
