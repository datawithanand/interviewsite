const request = require('supertest');
const { buildApp, createTestUser, authHeader, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');
const { invalidateSettingsCache } = require('../src/utils/settings');

const app = buildApp();

afterEach(() => {
  invalidateSettingsCache();
});

afterAll(async () => {
  await prisma.settings.deleteMany();
  invalidateSettingsCache();
  await prisma.$disconnect();
});

describe('Admin settings', () => {
  test('non-admin cannot read or change settings', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const get = await request(app).get('/api/settings').set(authHeader(token));
    expect(get.status).toBe(403);
    const patch = await request(app).patch('/api/settings').set(authHeader(token)).send({ passwordMinLength: 12 });
    expect(patch.status).toBe(403);
  });

  test('admin can read and update settings', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    const get = await request(app).get('/api/settings').set(authHeader(token));
    expect(get.status).toBe(200);
    expect(get.body.settings.passwordMinLength).toBe(8);

    const patch = await request(app)
      .patch('/api/settings')
      .set(authHeader(token))
      .send({ passwordMinLength: 12, maxFailedLoginAttempts: 3 });
    expect(patch.status).toBe(200);
    expect(patch.body.settings.passwordMinLength).toBe(12);
    expect(patch.body.settings.maxFailedLoginAttempts).toBe(3);
  });

  test('updated password policy is enforced on registration', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    await request(app).patch('/api/settings').set(authHeader(token)).send({ passwordMinLength: 16 });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'settingstest_shortpw',
        password: 'Short123', // 8 chars, below the new 16 minimum
        securityQuestion: { customQuestion: 'q one?', answer: 'a' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/16 characters/);

    await request(app).patch('/api/settings').set(authHeader(token)).send({ passwordMinLength: 8 });
  });

  test('lowered max failed attempts locks the account sooner', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    const setLimit = await request(app)
      .patch('/api/settings')
      .set(authHeader(token))
      .send({ maxFailedLoginAttempts: 3 }); // schema enforces a minimum of 3
    expect(setLimit.status).toBe(200);
    expect(setLimit.body.settings.maxFailedLoginAttempts).toBe(3);

    const username = 'settingstest_lockout';
    await request(app)
      .post('/api/auth/register')
      .send({
        username,
        password: 'GoodPass123',
        securityQuestion: { customQuestion: 'q one?', answer: 'a' },
      });

    await request(app).post('/api/auth/login').send({ username, password: 'WrongPassword1' });
    await request(app).post('/api/auth/login').send({ username, password: 'WrongPassword1' });
    const third = await request(app).post('/api/auth/login').send({ username, password: 'WrongPassword1' });
    expect(third.status).toBe(401);

    const fourth = await request(app).post('/api/auth/login').send({ username, password: 'GoodPass123' });
    expect(fourth.status).toBe(423);

    await request(app).patch('/api/settings').set(authHeader(token)).send({ maxFailedLoginAttempts: 5 });
  });

  test('disabling registration blocks new signups but not the bootstrap admin case', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    await request(app).patch('/api/settings').set(authHeader(token)).send({ registrationEnabled: false });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'settingstest_blocked',
        password: 'GoodPass123',
        securityQuestion: { customQuestion: 'q one?', answer: 'a' },
      });
    expect(res.status).toBe(403);

    await request(app).patch('/api/settings').set(authHeader(token)).send({ registrationEnabled: true });
  });
});
