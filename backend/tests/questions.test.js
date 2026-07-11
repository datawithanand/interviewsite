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
      title: 'Sample question',
      format: 'TEXT',
      questionText: 'What does CMDB stand for?',
      answerText: 'Configuration Management Database',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Questions', () => {
  test('serial numbers auto-increment per node starting at 1', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();

    const q1 = await createQuestion(token, node.id, { title: 'Q1' });
    const q2 = await createQuestion(token, node.id, { title: 'Q2' });
    const q3 = await createQuestion(token, node.id, { title: 'Q3' });

    expect(q1.body.question.serialNumber).toBe(1);
    expect(q2.body.question.serialNumber).toBe(2);
    expect(q3.body.question.serialNumber).toBe(3);
  });

  test('serial numbers are independent per node', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();

    const a1 = await createQuestion(token, nodeA.id);
    const b1 = await createQuestion(token, nodeB.id);

    expect(a1.body.question.serialNumber).toBe(1);
    expect(b1.body.question.serialNumber).toBe(1);
  });

  test('concurrent creates in the same node never collide on serial number', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createQuestion(token, node.id, { title: `Concurrent ${i}` }))
    );
    const serials = results.map((r) => r.body.question.serialNumber).sort((a, b) => a - b);
    expect(serials).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('TEXT format requires only answerText — the question itself is the title', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();

    const missingAnswer = await createQuestion(token, node.id, { answerText: '' });
    expect(missingAnswer.status).toBe(400);

    // questionText is no longer collected for TEXT — omitting it is fine,
    // and the backend nulls it out even if a client sends one.
    const res = await createQuestion(token, node.id, { questionText: '' });
    expect(res.status).toBe(201);
    expect(res.body.question.questionText).toBeNull();
  });

  test('CODE format requires only questionCode and codeLanguage — no separate answer', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const res = await createQuestion(token, node.id, {
      format: 'CODE',
      questionText: undefined,
      answerText: undefined,
      questionCode: 'function f() {}',
      answerCode: 'return 1;', // ignored — CODE never stores a separate answer
      codeLanguage: 'javascript',
    });
    expect(res.status).toBe(201);
    expect(res.body.question.format).toBe('CODE');
    expect(res.body.question.questionText).toBeNull();
    expect(res.body.question.answerText).toBeNull();
    expect(res.body.question.answerCode).toBeNull();
  });

  test('CODE format rejects missing codeLanguage', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const res = await createQuestion(token, node.id, {
      format: 'CODE',
      questionText: undefined,
      answerText: undefined,
      questionCode: 'code',
      answerCode: 'code',
    });
    expect(res.status).toBe(400);
  });

  test('BOTH format requires only questionText and questionCode — no separate answer', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();

    const missingCode = await createQuestion(token, node.id, { format: 'BOTH', codeLanguage: 'python', questionCode: '' });
    expect(missingCode.status).toBe(400);

    const complete = await createQuestion(token, node.id, {
      format: 'BOTH',
      codeLanguage: 'python',
      questionText: 'Explain the algorithm',
      questionCode: 'def f(): pass',
      answerText: 'It works like this', // ignored — BOTH never stores a separate answer
      answerCode: 'return 1',
    });
    expect(complete.status).toBe(201);
    expect(complete.body.question.questionText).toBe('Explain the algorithm');
    expect(complete.body.question.questionCode).toBe('def f(): pass');
    expect(complete.body.question.answerText).toBeNull();
    expect(complete.body.question.answerCode).toBeNull();
  });

  test('editing a question records a version snapshot', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(token, node.id, { title: 'Original title' });

    const edit = await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(token))
      .send({ title: 'Updated title', changeDescription: 'Fixed typo' });
    expect(edit.status).toBe(200);
    expect(edit.body.question.title).toBe('Updated title');

    const versions = await request(app).get(`/api/questions/${created.body.question.id}/versions`).set(authHeader(token));
    expect(versions.body.versions.length).toBe(1);
    expect(versions.body.versions[0].previousContent.title).toBe('Original title');
  });

  test('editing to switch format enforces the new format\'s required fields and clears the unused answer', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(token, node.id);

    const badSwitch = await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(token))
      .send({ format: 'CODE' }); // no questionCode/codeLanguage provided
    expect(badSwitch.status).toBe(400);

    const goodSwitch = await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(token))
      .send({ format: 'CODE', questionCode: 'code', codeLanguage: 'python' });
    expect(goodSwitch.status).toBe(200);
    expect(goodSwitch.body.question.questionText).toBeNull();
    expect(goodSwitch.body.question.answerText).toBeNull();
    expect(goodSwitch.body.question.answerCode).toBeNull();
  });

  test('duplicate creates a clone with a new serial number', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const q1 = await createQuestion(token, node.id);
    const q2 = await createQuestion(token, node.id);

    const dup = await request(app).post(`/api/questions/${q1.body.question.id}/duplicate`).set(authHeader(token));
    expect(dup.status).toBe(201);
    expect(dup.body.question.serialNumber).toBe(3);
    expect(dup.body.question.title).toContain('Copy');
  });

  test('favorites can be added and removed', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);
    const questionId = created.body.question.id;

    const fav = await request(app).post(`/api/questions/${questionId}/favorite`).set(authHeader(token));
    expect(fav.status).toBe(204);

    const list = await request(app).get('/api/questions').query({ favoritesOnly: 'true' }).set(authHeader(token));
    expect(list.body.questions.some((q) => q.id === questionId)).toBe(true);

    const unfav = await request(app).delete(`/api/questions/${questionId}/favorite`).set(authHeader(token));
    expect(unfav.status).toBe(204);
  });

  test('search filters across questionText/questionCode/answerText/answerCode', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    await createQuestion(token, node.id, { title: 'Unique Searchable Title XYZ' });

    const res = await request(app).get('/api/questions').query({ q: 'Searchable Title XYZ' }).set(authHeader(token));
    expect(res.body.questions.length).toBeGreaterThanOrEqual(1);
  });

  test('bulk delete removes multiple questions', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const q1 = await createQuestion(token, node.id);
    const q2 = await createQuestion(token, node.id);

    const res = await request(app)
      .post('/api/questions/bulk')
      .set(authHeader(token))
      .send({ questionIds: [q1.body.question.id, q2.body.question.id], action: 'delete' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  test('bulk moveNode rejects a non-leaf target', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const q1 = await createQuestion(token, node.id);

    const parent = await createTestNode();
    await createTestNode({ parentId: parent.id }); // gives parent a child, making it non-leaf

    const res = await request(app)
      .post('/api/questions/bulk')
      .set(authHeader(token))
      .send({ questionIds: [q1.body.question.id], action: 'moveNode', nodeId: parent.id });
    expect(res.status).toBe(400);
  });

  test('deleted node hides its questions from the listing even though rows still exist historically', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(token, node.id);

    await prisma.node.update({ where: { id: node.id }, data: { isArchived: true } });

    const list = await request(app).get('/api/questions').query({ nodeId: node.id }).set(authHeader(token));
    expect(list.body.questions.find((q) => q.id === created.body.question.id)).toBeUndefined();
  });
});
