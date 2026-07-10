const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestNode, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuestion(token, nodeId, overrides = {}) {
  return request(app)
    .post('/api/questions')
    .set(authHeader(token))
    .send({
      nodeId,
      title: 'Stats sample',
      format: 'TEXT',
      questionText: 'q',
      answerText: 'a',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Stats dashboard', () => {
  test('regular user cannot access stats', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).get('/api/stats').set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test('content manager/admin get a well-formed stats payload with multiple contributors', async () => {
    const { token: cmA } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: cmB } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const tech = await createTestNode({ name: `StatsTech_${Date.now()}` });
    const leaf = await createTestNode({ name: 'StatsLeaf', parentId: tech.id });

    await createQuestion(cmA, leaf.id, { title: 'A1' });
    await createQuestion(cmA, leaf.id, { title: 'A2' });
    await createQuestion(cmB, leaf.id, { title: 'B1' });

    const res = await request(app).get('/api/stats').set(authHeader(cmA));
    expect(res.status).toBe(200);
    expect(res.body.totalQuestions).toBeGreaterThanOrEqual(3);
    expect(res.body.questionsByTechnology.some((t) => t.technology === tech.name)).toBe(true);
    expect(res.body.mostActiveContributors.length).toBeGreaterThanOrEqual(2);
    // sorted descending by count
    for (let i = 1; i < res.body.mostActiveContributors.length; i += 1) {
      expect(res.body.mostActiveContributors[i - 1].count).toBeGreaterThanOrEqual(res.body.mostActiveContributors[i].count);
    }
    expect(res.body.users.total).toBeGreaterThan(0);
    expect(res.body.recentlyRegisteredUsers.length).toBeGreaterThan(0);
  });
});
