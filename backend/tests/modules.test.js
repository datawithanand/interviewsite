const request = require('supertest');
const { buildApp, createTestUser, authHeader, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Modules', () => {
  test('create, rename, and soft-delete a module', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });

    const create = await request(app).post('/api/modules').set(authHeader(token)).send({ name: 'CMDB Basics' });
    expect(create.status).toBe(201);
    const moduleId = create.body.module.id;

    const rename = await request(app)
      .patch(`/api/modules/${moduleId}`)
      .set(authHeader(token))
      .send({ name: 'CMDB Fundamentals' });
    expect(rename.status).toBe(200);
    expect(rename.body.module.name).toBe('CMDB Fundamentals');

    const del = await request(app).delete(`/api/modules/${moduleId}`).set(authHeader(token));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/modules').set(authHeader(token));
    expect(list.body.modules.find((m) => m.id === moduleId)).toBeUndefined();
  });

  test('rejects duplicate module names', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    await request(app).post('/api/modules').set(authHeader(token)).send({ name: 'Unique Module A' });
    const dupe = await request(app).post('/api/modules').set(authHeader(token)).send({ name: 'Unique Module A' });
    expect(dupe.status).toBe(409);
  });

  test('module stats reflect question count', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    const create = await request(app).post('/api/modules').set(authHeader(token)).send({ name: 'Stats Module' });
    const moduleId = create.body.module.id;

    await request(app)
      .post('/api/questions')
      .set(authHeader(token))
      .send({
        moduleId,
        title: 'Q1',
        content: 'content',
        format: 'TEXT',
        answer: 'answer',
        difficulty: 'BEGINNER',
      });

    const stats = await request(app).get(`/api/modules/${moduleId}`).set(authHeader(token));
    expect(stats.body.module.questionCount).toBe(1);
  });
});
