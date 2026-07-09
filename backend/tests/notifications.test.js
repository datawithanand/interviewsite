const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestModule, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuestion(token, moduleId, overrides = {}) {
  return request(app)
    .post('/api/questions')
    .set(authHeader(token))
    .send({
      moduleId,
      title: 'Notif sample',
      content: 'content',
      format: 'TEXT',
      answer: 'answer',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Notifications', () => {
  test('editing another writer\'s question notifies the original creator', async () => {
    const { token: writerAToken } = await createTestUser({ role: ROLES.WRITER });
    const { token: writerBToken } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();

    const created = await createQuestion(writerAToken, mod.id, { title: 'Owned by A' });
    await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(writerBToken))
      .send({ title: 'Edited by B' });

    const notifs = await request(app).get('/api/notifications').set(authHeader(writerAToken));
    expect(notifs.status).toBe(200);
    expect(notifs.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(notifs.body.notifications.some((n) => n.type === 'QUESTION_EDITED')).toBe(true);
  });

  test('editing your own question does not notify yourself', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const created = await createQuestion(token, mod.id);
    await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(token))
      .send({ title: 'Self edit' });

    const notifs = await request(app).get('/api/notifications').set(authHeader(token));
    expect(notifs.body.unreadCount).toBe(0);
  });

  test('mark-read and read-all work', async () => {
    const { token: writerAToken } = await createTestUser({ role: ROLES.WRITER });
    const { token: writerBToken } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule();
    const created = await createQuestion(writerAToken, mod.id);
    await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(writerBToken))
      .send({ title: 'Edited again' });

    const before = await request(app).get('/api/notifications').set(authHeader(writerAToken));
    const notifId = before.body.notifications[0].id;

    const markOne = await request(app).post(`/api/notifications/${notifId}/read`).set(authHeader(writerAToken));
    expect(markOne.status).toBe(204);

    const readAll = await request(app).post('/api/notifications/read-all').set(authHeader(writerAToken));
    expect(readAll.status).toBe(204);

    const after = await request(app).get('/api/notifications').set(authHeader(writerAToken));
    expect(after.body.unreadCount).toBe(0);
  });

  test('role change notifies the target user', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const { user: target, token: targetToken } = await createTestUser({ role: ROLES.REGULAR_USER });

    await request(app).patch(`/api/users/${target.id}/role`).set(authHeader(adminToken)).send({ role: ROLES.WRITER });

    const notifs = await request(app).get('/api/notifications').set(authHeader(targetToken));
    expect(notifs.body.notifications.some((n) => n.type === 'ROLE_CHANGED')).toBe(true);
  });
});
