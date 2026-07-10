const request = require('supertest');
const { buildApp, createTestUser, authHeader, createTestNode, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuestion(token, nodeId) {
  return request(app)
    .post('/api/questions')
    .set(authHeader(token))
    .send({
      nodeId,
      title: 'Comment sample',
      format: 'TEXT',
      questionText: 'question text',
      answerText: 'answer text',
      difficulty: 'BEGINNER',
    });
}

describe('Comments', () => {
  test('any authenticated user can comment on a question', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: userToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);

    const comment = await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(userToken))
      .send({ content: 'Great question!' });
    expect(comment.status).toBe(201);

    const list = await request(app).get(`/api/questions/${created.body.question.id}/comments`).set(authHeader(cmToken));
    expect(list.body.comments.length).toBe(1);
    expect(list.body.comments[0].content).toBe('Great question!');
  });

  test('commenting notifies the question creator', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: userToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);

    await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(userToken))
      .send({ content: 'Nice one.' });

    const notifs = await request(app).get('/api/notifications').set(authHeader(cmToken));
    expect(notifs.body.notifications.some((n) => n.type === 'NEW_COMMENT')).toBe(true);
  });

  test('a user can delete their own comment; others cannot', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: userAToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: userBToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);

    const comment = await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(userAToken))
      .send({ content: 'mine' });

    const forbidden = await request(app).delete(`/api/comments/${comment.body.comment.id}`).set(authHeader(userBToken));
    expect(forbidden.status).toBe(403);

    const allowed = await request(app).delete(`/api/comments/${comment.body.comment.id}`).set(authHeader(userAToken));
    expect(allowed.status).toBe(204);
  });

  test('only admin can pin a comment', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: userToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);

    const comment = await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(userToken))
      .send({ content: 'pin me' });

    const forbidden = await request(app)
      .patch(`/api/comments/${comment.body.comment.id}/pin`)
      .set(authHeader(userToken))
      .send({ isPinned: true });
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .patch(`/api/comments/${comment.body.comment.id}/pin`)
      .set(authHeader(adminToken))
      .send({ isPinned: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.comment.isPinned).toBe(true);
  });

  test('comments are cascade-deleted with the question', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);
    await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(cmToken))
      .send({ content: 'will vanish' });

    await request(app).delete(`/api/questions/${created.body.question.id}`).set(authHeader(cmToken));

    const remaining = await prisma.comment.findMany({ where: { questionId: created.body.question.id } });
    expect(remaining.length).toBe(0);
  });
});
