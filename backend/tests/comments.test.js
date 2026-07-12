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

  test('content manager and admin can delete any comment, not just their own', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: adminToken } = await createTestUser({ role: ROLES.ADMIN });
    const { token: userToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);

    const commentA = await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(userToken))
      .send({ content: 'first' });
    const deletedByCM = await request(app).delete(`/api/comments/${commentA.body.comment.id}`).set(authHeader(cmToken));
    expect(deletedByCM.status).toBe(204);

    const commentB = await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(userToken))
      .send({ content: 'second' });
    const deletedByAdmin = await request(app).delete(`/api/comments/${commentB.body.comment.id}`).set(authHeader(adminToken));
    expect(deletedByAdmin.status).toBe(204);
  });

  test('comments can be liked/unliked, with a like count and liker usernames', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: userAToken, user: userA } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: userBToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);

    const comment = await request(app)
      .post(`/api/questions/${created.body.question.id}/comments`)
      .set(authHeader(cmToken))
      .send({ content: 'like me' });
    const commentId = comment.body.comment.id;

    const likedA = await request(app).post(`/api/comments/${commentId}/like`).set(authHeader(userAToken));
    expect(likedA.body.comment.likeCount).toBe(1);
    expect(likedA.body.comment.likedByMe).toBe(true);
    expect(likedA.body.comment.likedByUsernames).toContain(userA.username);

    const likedB = await request(app).post(`/api/comments/${commentId}/like`).set(authHeader(userBToken));
    expect(likedB.body.comment.likeCount).toBe(2);

    const unlikedA = await request(app).post(`/api/comments/${commentId}/like`).set(authHeader(userAToken));
    expect(unlikedA.body.comment.likeCount).toBe(1);
    expect(unlikedA.body.comment.likedByMe).toBe(false);
  });

  test('comments support unlimited-depth threaded replies', async () => {
    const { token: cmToken } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const { token: userToken } = await createTestUser({ role: ROLES.REGULAR_USER });
    const node = await createTestNode();
    const created = await createQuestion(cmToken, node.id);
    const questionId = created.body.question.id;

    const root = await request(app)
      .post(`/api/questions/${questionId}/comments`)
      .set(authHeader(cmToken))
      .send({ content: 'root' });

    const reply1 = await request(app)
      .post(`/api/questions/${questionId}/comments`)
      .set(authHeader(userToken))
      .send({ content: 'reply 1', parentId: root.body.comment.id });
    expect(reply1.status).toBe(201);
    expect(reply1.body.comment.parentId).toBe(root.body.comment.id);

    const reply2 = await request(app)
      .post(`/api/questions/${questionId}/comments`)
      .set(authHeader(cmToken))
      .send({ content: 'reply to reply', parentId: reply1.body.comment.id });
    expect(reply2.status).toBe(201);
    expect(reply2.body.comment.parentId).toBe(reply1.body.comment.id);

    const list = await request(app).get(`/api/questions/${questionId}/comments`).set(authHeader(cmToken));
    expect(list.body.comments.length).toBe(3);

    // Deleting the root cascades to every descendant reply.
    await request(app).delete(`/api/comments/${root.body.comment.id}`).set(authHeader(cmToken));
    const remaining = await prisma.comment.findMany({ where: { questionId } });
    expect(remaining.length).toBe(0);
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
