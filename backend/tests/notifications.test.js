const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestNode, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuestion(token, nodeId, overrides = {}) {
  return request(app)
    .post('/api/questions')
    .set(authHeader(token))
    .send({
      nodeId,
      title: 'Notif sample',
      format: 'TEXT',
      questionText: 'question text',
      answerText: 'answer text',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Notifications', () => {
  test("editing another content manager's question notifies the original creator", async () => {
    const { token: cmAToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: cmBToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();

    const created = await createQuestion(cmAToken, node.id, { title: 'Owned by A' });
    await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(cmBToken))
      .send({ title: 'Edited by B' });

    const notifs = await request(app).get('/api/notifications').set(authHeader(cmAToken));
    expect(notifs.status).toBe(200);
    expect(notifs.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(notifs.body.notifications.some((n) => n.type === 'QUESTION_EDITED')).toBe(true);
  });

  test('editing your own question does not notify yourself', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(token, node.id);
    await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(token))
      .send({ title: 'Self edit' });

    const notifs = await request(app).get('/api/notifications').set(authHeader(token));
    expect(notifs.body.unreadCount).toBe(0);
  });

  test('mark-read and read-all work', async () => {
    const { token: cmAToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: cmBToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(cmAToken, node.id);
    await request(app)
      .patch(`/api/questions/${created.body.question.id}`)
      .set(authHeader(cmBToken))
      .send({ title: 'Edited again' });

    const before = await request(app).get('/api/notifications').set(authHeader(cmAToken));
    const notifId = before.body.notifications[0].id;

    const markOne = await request(app).post(`/api/notifications/${notifId}/read`).set(authHeader(cmAToken));
    expect(markOne.status).toBe(204);

    const readAll = await request(app).post('/api/notifications/read-all').set(authHeader(cmAToken));
    expect(readAll.status).toBe(204);

    const after = await request(app).get('/api/notifications').set(authHeader(cmAToken));
    expect(after.body.unreadCount).toBe(0);
  });

  test('role change notifies the target user', async () => {
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const { user: target, token: targetToken } = await createTestUser({ role: ROLES.REGULAR_USER });

    await request(app).patch(`/api/users/${target.id}/role`).set(authHeader(adminToken)).send({ role: ROLES.CONTENT_MANAGER });

    const notifs = await request(app).get('/api/notifications').set(authHeader(targetToken));
    expect(notifs.body.notifications.some((n) => n.type === 'ROLE_CHANGED')).toBe(true);
  });
});
