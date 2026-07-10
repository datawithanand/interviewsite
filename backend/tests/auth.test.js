const request = require('supertest');
const { buildApp, prisma } = require('./helpers');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function getTemplateId() {
  const template = await prisma.securityQuestionTemplate.create({ data: { question: `Test template ${Date.now()}?` } });
  return template.id;
}

describe('Auth', () => {
  const basePassword = 'GoodPass123';

  test('rejects weak passwords on registration', async () => {
    const templateId = await getTemplateId();
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'authtest_weak',
        password: 'weak',
        securityQuestion: { templateId, answer: 'Rex' },
      });
    expect(res.status).toBe(400);
  });

  test('rejects registration with both templateId and customQuestion', async () => {
    const templateId = await getTemplateId();
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'authtest_both',
        password: basePassword,
        securityQuestion: { templateId, customQuestion: 'My own question?', answer: 'Rex' },
      });
    expect(res.status).toBe(400);
  });

  test('rejects registration with neither templateId nor customQuestion', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'authtest_neither', password: basePassword, securityQuestion: { answer: 'Rex' } });
    expect(res.status).toBe(400);
  });

  test('registers successfully with a predefined template question', async () => {
    const templateId = await getTemplateId();
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'authtest_alice',
        password: basePassword,
        securityQuestion: { templateId, answer: 'Rex' },
      });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('authtest_alice');
  });

  test('registers successfully with a custom question', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'authtest_custom',
        password: basePassword,
        securityQuestion: { customQuestion: 'What is your spirit animal?', answer: 'Owl' },
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { username: 'authtest_custom' } });
    expect(user.securityQuestion).toBe('What is your spirit animal?');
  });

  test('rejects duplicate username', async () => {
    const templateId = await getTemplateId();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'authtest_alice', password: basePassword, securityQuestion: { templateId, answer: 'Rex' } });
    expect(res.status).toBe(409);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'authtest_alice', password: basePassword });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('rejects login with wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'authtest_alice', password: 'WrongPassword1' });
    expect(res.status).toBe(401);
  });

  test('locks account after repeated failed logins', async () => {
    const templateId = await getTemplateId();
    const username = 'authtest_lockout';
    await request(app)
      .post('/api/auth/register')
      .send({ username, password: basePassword, securityQuestion: { templateId, answer: 'Rex' } });

    let lastRes;
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      lastRes = await request(app).post('/api/auth/login').send({ username, password: 'WrongPassword1' });
    }
    expect(lastRes.status).toBe(401);

    const lockedRes = await request(app).post('/api/auth/login').send({ username, password: basePassword });
    expect(lockedRes.status).toBe(423);
  });

  test('forgot-password start returns 404 User not found for a nonexistent username', async () => {
    const res = await request(app).post('/api/auth/forgot-password/start').send({ username: 'nonexistent_user_xyz' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found.');
  });

  test('forgot-password start returns the account\'s single security question when it exists', async () => {
    const templateId = await getTemplateId();
    const username = 'authtest_forgot_start';
    await request(app)
      .post('/api/auth/register')
      .send({ username, password: basePassword, securityQuestion: { templateId, answer: 'Rex' } });

    const res = await request(app).post('/api/auth/forgot-password/start').send({ username });
    expect(res.status).toBe(200);
    expect(typeof res.body.question).toBe('string');
    expect(res.body.question.length).toBeGreaterThan(0);
  });

  test('resets password via the correct security question answer', async () => {
    const username = 'authtest_reset';
    await request(app)
      .post('/api/auth/register')
      .send({ username, password: basePassword, securityQuestion: { customQuestion: 'Favorite food?', answer: 'Pizza' } });

    const verify = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ username, answer: 'Pizza', newPassword: 'BrandNewPass123' });
    expect(verify.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ username, password: 'BrandNewPass123' });
    expect(login.status).toBe(200);
  });

  test('rejects password reset with a wrong security answer', async () => {
    const username = 'authtest_reset_fail';
    await request(app)
      .post('/api/auth/register')
      .send({ username, password: basePassword, securityQuestion: { customQuestion: 'Favorite food?', answer: 'Pizza' } });

    const verify = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ username, answer: 'totally-wrong', newPassword: 'BrandNewPass123' });
    expect(verify.status).toBe(401);
  });

  test('rejects password reset for a nonexistent username with 404', async () => {
    const verify = await request(app)
      .post('/api/auth/forgot-password/verify')
      .send({ username: 'nonexistent_user_abc', answer: 'whatever', newPassword: 'BrandNewPass123' });
    expect(verify.status).toBe(404);
  });

  test('/me requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
