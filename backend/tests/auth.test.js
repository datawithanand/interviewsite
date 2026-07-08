const request = require('supertest');
const { buildApp, prisma } = require('./helpers');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Auth', () => {
  const baseUser = {
    username: 'authtest_alice',
    password: 'GoodPass123',
    securityQuestions: [
      { question: 'First pet?', answer: 'Rex' },
      { question: 'Favorite food?', answer: 'Pizza' },
      { question: 'Birth city?', answer: 'Gotham' },
    ],
  };

  test('rejects weak passwords on registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...baseUser, username: 'authtest_weak', password: 'weak' });
    expect(res.status).toBe(400);
  });

  test('rejects registration with fewer than 3 security questions', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...baseUser, username: 'authtest_fewq', securityQuestions: baseUser.securityQuestions.slice(0, 2) });
    expect(res.status).toBe(400);
  });

  test('registers a new user successfully', async () => {
    const res = await request(app).post('/api/auth/register').send(baseUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe(baseUser.username);
  });

  test('rejects duplicate username', async () => {
    const res = await request(app).post('/api/auth/register').send(baseUser);
    expect(res.status).toBe(409);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: baseUser.username, password: baseUser.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: baseUser.username, password: 'WrongPassword1' });
    expect(res.status).toBe(401);
  });

  test('locks account after repeated failed logins', async () => {
    const username = 'authtest_lockout';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });

    let lastRes;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastRes = await request(app).post('/api/auth/login').send({ username, password: 'WrongPassword1' });
    }
    expect(lastRes.status).toBe(401);

    const lockedRes = await request(app)
      .post('/api/auth/login')
      .send({ username, password: baseUser.password });
    expect(lockedRes.status).toBe(423);
  });

  test('does not reveal whether a username exists on forgot-password start', async () => {
    const known = await request(app).post('/api/auth/forgot-password/start').send({ username: baseUser.username });
    const unknown = await request(app).post('/api/auth/forgot-password/start').send({ username: 'nonexistent_user_xyz' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(Array.isArray(unknown.body.questions)).toBe(true);
    expect(unknown.body.questions.length).toBe(0);
    expect(known.body.questions.length).toBeGreaterThan(0);
  });

  test('resets password via correct security question answers', async () => {
    const username = 'authtest_reset';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });

    const start = await request(app).post('/api/auth/forgot-password/start').send({ username });
    expect(start.body.questions.length).toBeGreaterThanOrEqual(2);

    const answerMap = new Map(baseUser.securityQuestions.map((q) => [q.question, q.answer]));
    const answers = start.body.questions.map((q) => ({ id: q.id, answer: answerMap.get(q.question) }));

    const verify = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ username, answers, newPassword: 'BrandNewPass123' });
    expect(verify.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'BrandNewPass123' });
    expect(login.status).toBe(200);
  });

  test('rejects password reset with wrong security answers', async () => {
    const username = 'authtest_reset_fail';
    await request(app).post('/api/auth/register').send({ ...baseUser, username });

    const start = await request(app).post('/api/auth/forgot-password/start').send({ username });
    const answers = start.body.questions.map((q) => ({ id: q.id, answer: 'totally-wrong' }));

    const verify = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ username, answers, newPassword: 'BrandNewPass123' });
    expect(verify.status).toBe(401);
  });

  test('/me requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
