const request = require('supertest');
const { buildApp, createTestUser, authHeader, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Audit logs', () => {
  test('node creation is captured in the audit log', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });

    const create = await request(app)
      .post('/api/nodes')
      .set(authHeader(cmToken))
      .send({ name: `AuditedNode_${Date.now()}` });
    expect(create.status).toBe(201);

    const logs = await request(app)
      .get('/api/audit-logs')
      .query({ targetType: 'NODE', action: 'CREATE' })
      .set(authHeader(adminToken));

    expect(logs.status).toBe(200);
    expect(logs.body.logs.some((l) => l.targetId === create.body.node.id)).toBe(true);
  });

  test('failed login attempts are logged', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const username = `audituser_${Date.now()}`;
    await request(app)
      .post('/api/auth/register')
      .send({
        username,
        password: 'GoodPass123',
        securityQuestion: { customQuestion: 'q1?', answer: 'a1' },
      });
    await request(app).post('/api/auth/login').send({ username, password: 'WrongPassword1' });

    const logs = await request(app).get('/api/audit-logs').query({ action: 'LOGIN_FAILED' }).set(authHeader(adminToken));
    expect(logs.body.logs.length).toBeGreaterThan(0);
  });

  test('audit logs can be exported as CSV', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const res = await request(app).get('/api/audit-logs/export').set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });
});
