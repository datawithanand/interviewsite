const request = require('supertest');
const { buildApp, authHeader, createTestUser, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Sessions', () => {
  const baseUser = {
    username: 'sessiontest_user',
    password: 'GoodPass123',
    securityQuestion: { customQuestion: 'First pet?', answer: 'Rex' },
  };

  test('login creates a session, and it appears in the sessions list', async () => {
    await request(app).post('/api/auth/register').send(baseUser);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: baseUser.username, password: baseUser.password });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const sessions = await request(app).get('/api/auth/sessions').set(authHeader(token));
    expect(sessions.status).toBe(200);
    expect(sessions.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.body.sessions.some((s) => s.current)).toBe(true);
  });

  test('logout revokes the current session; token stops working', async () => {
    const username = 'sessiontest_logout';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });
    const login = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });
    const token = login.body.token;

    const logout = await request(app).post('/api/auth/logout').set(authHeader(token));
    expect(logout.status).toBe(204);

    const me = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(me.status).toBe(401);
  });

  test('revoking a specific session invalidates only that session', async () => {
    const username = 'sessiontest_multi';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });
    const login1 = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });
    const login2 = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });

    const sessionsRes = await request(app).get('/api/auth/sessions').set(authHeader(login1.body.token));
    const otherSession = sessionsRes.body.sessions.find((s) => !s.current);
    expect(otherSession).toBeDefined();

    const revoke = await request(app)
      .delete(`/api/auth/sessions/${otherSession.id}`)
      .set(authHeader(login1.body.token));
    expect(revoke.status).toBe(204);

    const meLogin1 = await request(app).get('/api/auth/me').set(authHeader(login1.body.token));
    expect(meLogin1.status).toBe(200);

    const meLogin2 = await request(app).get('/api/auth/me').set(authHeader(login2.body.token));
    expect(meLogin2.status).toBe(401);
  });

  test('revoke-all signs out other devices but keeps the current session', async () => {
    const username = 'sessiontest_revokeall';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });
    const login1 = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });
    const login2 = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });

    const revokeAll = await request(app).post('/api/auth/sessions/revoke-all').set(authHeader(login1.body.token));
    expect(revokeAll.status).toBe(204);

    const meLogin1 = await request(app).get('/api/auth/me').set(authHeader(login1.body.token));
    expect(meLogin1.status).toBe(200);

    const meLogin2 = await request(app).get('/api/auth/me').set(authHeader(login2.body.token));
    expect(meLogin2.status).toBe(401);
  });

  test('password reset via security questions revokes all sessions', async () => {
    const username = 'sessiontest_pwreset';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });
    const login = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });

    await request(app).post('/api/auth/forgot-password/start').send({ username });
    await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ username, answer: baseUser.securityQuestion.answer, newPassword: 'BrandNewPass123' });

    const me = await request(app).get('/api/auth/me').set(authHeader(login.body.token));
    expect(me.status).toBe(401);
  });

  test('admin force-logout revokes all of a target user sessions', async () => {
    const username = 'sessiontest_forcedout';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });
    const login = await request(app).post('/api/auth/login').send({ username, password: baseUser.password });
    const target = await prisma.user.findUnique({ where: { username } });
    const admin = await createTestUser({ role: ROLES.ADMIN });

    const forceLogout = await request(app)
      .post(`/api/users/${target.id}/force-logout`)
      .set(authHeader(admin.token));
    expect(forceLogout.status).toBe(204);

    const me = await request(app).get('/api/auth/me').set(authHeader(login.body.token));
    expect(me.status).toBe(401);
  });
});
