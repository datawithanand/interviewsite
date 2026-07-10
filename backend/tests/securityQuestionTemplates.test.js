const request = require('supertest');
const { buildApp, createTestUser, authHeader, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Security question templates', () => {
  test('public listing only returns active templates, no auth required', async () => {
    const active = await prisma.securityQuestionTemplate.create({ data: { question: `Active Q ${Date.now()}?` } });
    const inactive = await prisma.securityQuestionTemplate.create({ data: { question: `Inactive Q ${Date.now()}?`, isActive: false } });

    const res = await request(app).get('/api/security-question-templates');
    expect(res.status).toBe(200);
    expect(res.body.templates.some((t) => t.id === active.id)).toBe(true);
    expect(res.body.templates.some((t) => t.id === inactive.id)).toBe(false);
    // public listing never exposes anything answer-related
    expect(res.body.templates[0]).not.toHaveProperty('answerHash');
  });

  test('only admin can create/update/delete templates', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const create = await request(app).post('/api/security-question-templates').set(authHeader(cmToken)).send({ question: 'New question?' });
    expect(create.status).toBe(403);

    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const adminCreate = await request(app)
      .post('/api/security-question-templates')
      .set(authHeader(adminToken))
      .send({ question: `Admin-created question ${Date.now()}?` });
    expect(adminCreate.status).toBe(201);

    const update = await request(app)
      .patch(`/api/security-question-templates/${adminCreate.body.template.id}`)
      .set(authHeader(cmToken))
      .send({ isActive: false });
    expect(update.status).toBe(403);

    const adminUpdate = await request(app)
      .patch(`/api/security-question-templates/${adminCreate.body.template.id}`)
      .set(authHeader(adminToken))
      .send({ isActive: false });
    expect(adminUpdate.status).toBe(200);
    expect(adminUpdate.body.template.isActive).toBe(false);

    const del = await request(app)
      .delete(`/api/security-question-templates/${adminCreate.body.template.id}`)
      .set(authHeader(adminToken));
    expect(del.status).toBe(204);
  });

  test('rejects duplicate template questions', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const question = `Duplicate test ${Date.now()}?`;
    await request(app).post('/api/security-question-templates').set(authHeader(adminToken)).send({ question });
    const dupe = await request(app).post('/api/security-question-templates').set(authHeader(adminToken)).send({ question });
    expect(dupe.status).toBe(409);
  });

  test('registration accepts a valid templateId and rejects a deactivated one', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const template = await request(app)
      .post('/api/security-question-templates')
      .set(authHeader(adminToken))
      .send({ question: `Register-flow question ${Date.now()}?` });

    const goodRegister = await request(app)
      .post('/api/auth/register')
      .send({ username: `sqt_user_${Date.now()}`, password: 'GoodPass123', securityQuestion: { templateId: template.body.template.id, answer: 'x' } });
    expect(goodRegister.status).toBe(201);

    await request(app).patch(`/api/security-question-templates/${template.body.template.id}`).set(authHeader(adminToken)).send({ isActive: false });

    const badRegister = await request(app)
      .post('/api/auth/register')
      .send({ username: `sqt_user2_${Date.now()}`, password: 'GoodPass123', securityQuestion: { templateId: template.body.template.id, answer: 'x' } });
    expect(badRegister.status).toBe(400);
  });
});
