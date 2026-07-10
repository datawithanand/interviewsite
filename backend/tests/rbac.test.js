const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestNode, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RBAC enforcement', () => {
  test('regular user cannot create a node', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'RBAC Tech 1' });
    expect(res.status).toBe(403);
  });

  test('content manager can create a node', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const res = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'RBAC Tech 2' });
    expect(res.status).toBe(201);
  });

  test('regular user can view nodes and questions (read-only)', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).get('/api/nodes').set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test('regular user cannot create a question', async () => {
    const node = await createTestNode();
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app)
      .post('/api/questions')
      .set(authHeader(token))
      .send({
        nodeId: node.id,
        title: 'Q1',
        format: 'TEXT',
        questionText: 'What is an incident?',
        answerText: 'A disruption.',
        difficulty: 'BEGINNER',
      });
    expect(res.status).toBe(403);
  });

  test('content manager has full delete rights over questions created by other content managers', async () => {
    const node = await createTestNode();
    const { token: cmAToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: cmBToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });

    const create = await request(app)
      .post('/api/questions')
      .set(authHeader(cmAToken))
      .send({
        nodeId: node.id,
        title: 'Owned by A',
        format: 'TEXT',
        questionText: 'text',
        answerText: 'answer',
        difficulty: 'BEGINNER',
      });
    expect(create.status).toBe(201);

    const del = await request(app).delete(`/api/questions/${create.body.question.id}`).set(authHeader(cmBToken));
    expect(del.status).toBe(204);
  });

  test('only admin can access user management', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const res = await request(app).get('/api/users').set(authHeader(cmToken));
    expect(res.status).toBe(403);

    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const res2 = await request(app).get('/api/users').set(authHeader(adminToken));
    expect(res2.status).toBe(200);
  });

  test('content manager cannot manage users, reset passwords, or access admin settings', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { user: target } = await createTestUser({ role: ROLES.REGULAR_USER });

    const roleChange = await request(app).patch(`/api/users/${target.id}/role`).set(authHeader(cmToken)).send({ role: ROLES.CONTENT_MANAGER });
    expect(roleChange.status).toBe(403);

    const resetPw = await request(app).post(`/api/users/${target.id}/reset-password`).set(authHeader(cmToken)).send({ newPassword: 'NewPass123' });
    expect(resetPw.status).toBe(403);

    const settingsRes = await request(app).get('/api/settings').set(authHeader(cmToken));
    expect(settingsRes.status).toBe(403);
  });

  test('only admin can access audit logs', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const res = await request(app).get('/api/audit-logs').set(authHeader(cmToken));
    expect(res.status).toBe(403);
  });

  test('admin can grant and revoke content manager access', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const { user: target } = await createTestUser({ role: ROLES.REGULAR_USER });

    const grant = await request(app)
      .patch(`/api/users/${target.id}/role`)
      .set(authHeader(adminToken))
      .send({ role: ROLES.CONTENT_MANAGER });
    expect(grant.status).toBe(200);
    expect(grant.body.user.role).toBe(ROLES.CONTENT_MANAGER);

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
