const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestNode, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuestion(token, nodeId, overrides = {}) {
  const res = await request(app)
    .post('/api/questions')
    .set(authHeader(token))
    .send({
      nodeId,
      title: 'Sample question',
      format: 'TEXT',
      questionText: 'What does CMDB stand for?',
      answerText: 'Configuration Management Database',
      difficulty: 'BEGINNER',
      ...overrides,
    });
  return res.body.question;
}

describe('Progress / spaced repetition', () => {
  test('reviewing a question creates progress, awards XP, and schedules a future review', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const question = await createQuestion(cmToken, node.id);

    const res = await request(app)
      .post(`/api/progress/${question.id}/review`)
      .set(authHeader(token))
      .send({ rating: 'GOOD' });

    expect(res.status).toBe(200);
    expect(res.body.progress.status).toBe('LEARNING');
    expect(res.body.progress.repetitions).toBe(1);
    expect(res.body.xpEarned).toBe(8);
    expect(res.body.gameStats.xp).toBe(8);
    expect(new Date(res.body.progress.nextReviewAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.newBadges.some((b) => b.code === 'FIRST_STEPS')).toBe(true);
  });

  test('rating AGAIN resets repetitions and schedules an immediate re-review', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const question = await createQuestion(cmToken, node.id);

    await request(app).post(`/api/progress/${question.id}/review`).set(authHeader(token)).send({ rating: 'GOOD' });
    const res = await request(app).post(`/api/progress/${question.id}/review`).set(authHeader(token)).send({ rating: 'AGAIN' });

    expect(res.body.progress.repetitions).toBe(0);
    expect(res.body.progress.correctStreak).toBe(0);
    expect(res.body.progress.status).toBe('NEW');
  });

  test('the review queue surfaces due questions ahead of never-reviewed ones', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const q1 = await createQuestion(cmToken, node.id, { title: 'Q1' });
    await createQuestion(cmToken, node.id, { title: 'Q2' });

    // A rating schedules the next review in the future (even AGAIN, ~10
    // minutes out), so backdate it directly to deterministically simulate
    // "already due" without waiting on real time.
    await request(app).post(`/api/progress/${q1.id}/review`).set(authHeader(token)).send({ rating: 'AGAIN' });
    await prisma.questionProgress.updateMany({
      where: { questionId: q1.id },
      data: { nextReviewAt: new Date(Date.now() - 60 * 1000) },
    });

    const res = await request(app).get('/api/progress/queue').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.queue.length).toBeGreaterThanOrEqual(2);
    expect(res.body.queue[0].id).toBe(q1.id);
    expect(res.body.queue[0].progress).not.toBeNull();
  });

  test('summary reports weak areas by technology and overall XP/streak', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const tech = await createTestNode({ name: 'Python' });
    const q1 = await createQuestion(cmToken, tech.id, { title: 'Q1' });
    const q2 = await createQuestion(cmToken, tech.id, { title: 'Q2' });

    await request(app).post(`/api/progress/${q1.id}/review`).set(authHeader(token)).send({ rating: 'GOOD' });
    await request(app).post(`/api/progress/${q2.id}/review`).set(authHeader(token)).send({ rating: 'AGAIN' });

    const res = await request(app).get('/api/progress/summary').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.questionsAttempted).toBe(2);
    expect(res.body.gameStats.xp).toBeGreaterThan(0);
    expect(res.body.weakAreas.find((w) => w.technology === 'Python')).toBeTruthy();
  });

  test('badges endpoint returns the full catalog with earned state', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const question = await createQuestion(cmToken, node.id);

    await request(app).post(`/api/progress/${question.id}/review`).set(authHeader(token)).send({ rating: 'GOOD' });

    const res = await request(app).get('/api/progress/badges').set(authHeader(token));
    expect(res.status).toBe(200);
    const firstSteps = res.body.badges.find((b) => b.code === 'FIRST_STEPS');
    expect(firstSteps.earned).toBe(true);
    const mastered100 = res.body.badges.find((b) => b.code === 'MASTERED_100');
    expect(mastered100.earned).toBe(false);
  });

  test('progress endpoints require authentication', async () => {
    const res = await request(app).get('/api/progress/summary');
    expect(res.status).toBe(401);
  });
});
