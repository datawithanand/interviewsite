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

describe('Mock interviews', () => {
  test('starting a session draws questions from the requested scope', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const q1 = await createQuestion(cmToken, node.id, { title: 'Q1' });
    const q2 = await createQuestion(cmToken, node.id, { title: 'Q2' });

    const res = await request(app)
      .post('/api/mock-interviews')
      .set(authHeader(token))
      .send({ nodeIds: [node.id], count: 5 });

    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe('IN_PROGRESS');
    expect(res.body.session.questions.length).toBe(2);
    const ids = res.body.session.questions.map((q) => q.id).sort();
    expect(ids).toEqual([q1.id, q2.id].sort());
    expect(res.body.session.remainingSeconds).toBeGreaterThan(0);
  });

  test('rejects starting a session when no questions match the scope', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const emptyNode = await createTestNode();

    const res = await request(app)
      .post('/api/mock-interviews')
      .set(authHeader(token))
      .send({ nodeIds: [emptyNode.id] });

    expect(res.status).toBe(400);
  });

  test('answering and finishing a session scores it, awards XP, and updates spaced-repetition progress', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const q1 = await createQuestion(cmToken, node.id, { title: 'Q1' });
    const q2 = await createQuestion(cmToken, node.id, { title: 'Q2' });

    const start = await request(app).post('/api/mock-interviews').set(authHeader(token)).send({ nodeIds: [node.id] });
    const sessionId = start.body.session.id;

    await request(app)
      .post(`/api/mock-interviews/${sessionId}/answer`)
      .set(authHeader(token))
      .send({ questionId: q1.id, selfRating: 'CORRECT', timeSpentSeconds: 30 });
    await request(app)
      .post(`/api/mock-interviews/${sessionId}/answer`)
      .set(authHeader(token))
      .send({ questionId: q2.id, selfRating: 'INCORRECT', timeSpentSeconds: 20 });

    const finish = await request(app).post(`/api/mock-interviews/${sessionId}/finish`).set(authHeader(token));
    expect(finish.status).toBe(200);
    expect(finish.body.score).toBe(50);
    expect(finish.body.correctCount).toBe(1);
    expect(finish.body.incorrectCount).toBe(1);
    expect(finish.body.xpEarned).toBeGreaterThan(0);

    const progressRes = await request(app).get('/api/progress/summary').set(authHeader(token));
    expect(progressRes.body.questionsAttempted).toBe(2);

    // Finishing twice is rejected.
    const secondFinish = await request(app).post(`/api/mock-interviews/${sessionId}/finish`).set(authHeader(token));
    expect(secondFinish.status).toBe(400);
  });

  test('a user cannot view or answer another user session', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: ownerToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: intruderToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    await createQuestion(cmToken, node.id);

    const start = await request(app).post('/api/mock-interviews').set(authHeader(ownerToken)).send({ nodeIds: [node.id] });
    const sessionId = start.body.session.id;

    const getRes = await request(app).get(`/api/mock-interviews/${sessionId}`).set(authHeader(intruderToken));
    expect(getRes.status).toBe(404);
  });

  test('history lists only completed/abandoned sessions for the current user', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    await createQuestion(cmToken, node.id);

    const start = await request(app).post('/api/mock-interviews').set(authHeader(token)).send({ nodeIds: [node.id] });
    await request(app).post(`/api/mock-interviews/${start.body.session.id}/finish`).set(authHeader(token));

    const history = await request(app).get('/api/mock-interviews/history').set(authHeader(token));
    expect(history.status).toBe(200);
    expect(history.body.sessions.length).toBe(1);
    expect(history.body.sessions[0].status).toBe('COMPLETED');
  });
});
