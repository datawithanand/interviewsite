const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestModule, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RBAC enforcement', () => {
  test('regular user cannot create a module', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).post('/api/modules').set(authHeader(token)).send({ name: 'RBAC Mod 1' });
    expect(res.status).toBe(403);
  });

  test('writer can create a module', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const res = await request(app).post('/api/modules').set(authHeader(token)).send({ name: 'RBAC Mod 2' });
    expect(res.status).toBe(201);
  });

  test('regular user can view modules and questions (read-only)', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).get('/api/modules').set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test('regular user cannot create a question', async () => {
    const mod = await createTestModule();
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app)
      .post('/api/questions')
      .set(authHeader(token))
      .send({
        moduleId: mod.id,
        title: 'Q1',
        content: 'What is an incident?',
        format: 'TEXT',
        answer: 'A disruption.',
        difficulty: 'BEGINNER',
      });
    expect(res.status).toBe(403);
  });

  test('writer has full delete rights over questions created by others (per resolved spec conflict)', async () => {
    const mod = await createTestModule();
    const { token: writerAToken } = await createTestUser({ role: ROLES.WRITER });
    const { token: writerBToken } = await createTestUser({ role: ROLES.WRITER });

    const create = await request(app)
      .post('/api/questions')
      .set(authHeader(writerAToken))
      .send({
        moduleId: mod.id,
        title: 'Owned by A',
        content: 'content',
        format: 'TEXT',
        answer: 'answer',
        difficulty: 'BEGINNER',
      });
    expect(create.status).toBe(201);

    const del = await request(app)
      .delete(`/api/questions/${create.body.question.id}`)
      .set(authHeader(writerBToken));
    expect(del.status).toBe(204);
  });

  test('only admin can access user management', async () => {
    const { token: writerToken } = await createTestUser({ role: ROLES.WRITER });
    const res = await request(app).get('/api/users').set(authHeader(writerToken));
    expect(res.status).toBe(403);

    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const res2 = await request(app).get('/api/users').set(authHeader(adminToken));
    expect(res2.status).toBe(200);
  });

  test('only admin can access audit logs', async () => {
    const { token: writerToken } = await createTestUser({ role: ROLES.WRITER });
    const res = await request(app).get('/api/audit-logs').set(authHeader(writerToken));
    expect(res.status).toBe(403);
  });

  test('admin can grant and revoke writer access', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const { user: target } = await createTestUser({ role: ROLES.REGULAR_USER });

    const grant = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set(authHeader(adminToken))
      .send({ role: ROLES.WRITER });
    expect(grant.status).toBe(200);
    expect(grant.body.user.role).toBe(ROLES.WRITER);

    const revoke = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set(authHeader(adminToken))
      .send({ role: ROLES.REGULAR_USER });
    expect(revoke.status).toBe(200);
    expect(revoke.body.user.role).toBe(ROLES.REGULAR_USER);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(401);
  });
});
