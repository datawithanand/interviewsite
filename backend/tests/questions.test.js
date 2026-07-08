const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestModule, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuestion(token, moduleId, overrides = {}) {
  return request(app)
    .post('/api/questions')
    .set(authHeader(token))
    .send({
      moduleId,
      title: 'Sample question',
      content: 'What does CMDB stand for?',
      format: 'TEXT',
      answer: 'Configuration Management Database',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Questions', () => {
  test('serial numbers auto-increment per module starting at 1', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();

    const q1 = await createQuestion(token, mod.id, { title: 'Q1' });
    const q2 = await createQuestion(token, mod.id, { title: 'Q2' });
    const q3 = await createQuestion(token, mod.id, { title: 'Q3' });

    expect(q1.body.question.serialNumber).toBe(1);
    expect(q2.body.question.serialNumber).toBe(2);
    expect(q3.body.question.serialNumber).toBe(3);
  });

  test('serial numbers are independent per module', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const modA = await createTestModule();
    const modB = await createTestModule();

    const a1 = await createQuestion(token, modA.id);
    const b1 = await createQuestion(token, modB.id);

    expect(a1.body.question.serialNumber).toBe(1);
    expect(b1.body.question.serialNumber).toBe(1);
  });

  test('concurrent creates in the same module never collide on serial number', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createQuestion(token, mod.id, { title: `Concurrent ${i}` }))
    );
    const serials = results.map((r) => r.body.question.serialNumber).sort((a, b) => a - b);
    expect(serials).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('requires codeLanguage when format is CODE', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const res = await createQuestion(token, mod.id, { format: 'CODE', codeLanguage: undefined });
    expect(res.status).toBe(400);
  });

  test('accepts CODE format with a valid codeLanguage', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const res = await createQuestion(token, mod.id, {
      format: 'CODE',
      codeLanguage: 'javascript',
      content: 'function f() {}',
    });
    expect(res.status).toBe(201);
    expect(res.body.question.codeLanguage).toBe('javascript');
  });

  test('editing a question records a version snapshot', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const created = await createQuestion(token, mod.id, { title: 'Original title' });

    const edit = await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(token))
      .send({ title: 'Updated title', changeDescription: 'Fixed typo' });
    expect(edit.status).toBe(200);
    expect(edit.body.question.title).toBe('Updated title');

    const versions = await request(app)
      .get(`/api/questions/${created.body.question.id}/versions`)
      .set(authHeader(token));
    expect(versions.body.versions.length).toBe(1);
    expect(versions.body.versions[0].previousContent.title).toBe('Original title');
  });

  test('duplicate creates a clone with a new serial number', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const q1 = await createQuestion(token, mod.id);
    const q2 = await createQuestion(token, mod.id);

    const dup = await request(app).post(`/api/questions/${q1.body.question.id}/duplicate`).set(authHeader(token));
    expect(dup.status).toBe(201);
    expect(dup.body.question.serialNumber).toBe(3);
    expect(dup.body.question.title).toContain('Copy');
  });

  test('favorites can be added and removed', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: writerToken } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const created = await createQuestion(writerToken, mod.id);
    const questionId = created.body.question.id;

    const fav = await request(app).post(`/api/questions/${questionId}/favorite`).set(authHeader(token));
    expect(fav.status).toBe(204);

    const list = await request(app)
      .get('/api/questions')
      .query({ favoritesOnly: 'true' })
      .set(authHeader(token));
    expect(list.body.questions.some((q) => q.id === questionId)).toBe(true);

    const unfav = await request(app).delete(`/api/questions/${questionId}/favorite`).set(authHeader(token));
    expect(unfav.status).toBe(204);
  });

  test('search filters by title/content text', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    await createQuestion(token, mod.id, { title: 'Unique Searchable Title XYZ' });

    const res = await request(app).get('/api/questions').query({ q: 'Searchable Title XYZ' }).set(authHeader(token));
    expect(res.body.questions.length).toBeGreaterThanOrEqual(1);
  });

  test('bulk delete removes multiple questions', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const q1 = await createQuestion(token, mod.id);
    const q2 = await createQuestion(token, mod.id);

    const res = await request(app)
      .post('/api/questions/bulk')
      .set(authHeader(token))
      .send({ questionIds: [q1.body.question.id, q2.body.question.id], action: 'delete' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });
});
