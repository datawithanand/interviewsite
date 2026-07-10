const request = require('supertest');
const { buildApp, createTestUser, authHeader, prisma } = require('./helpers');
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
      title: 'Sample',
      format: 'TEXT',
      questionText: 'question text',
      answerText: 'answer text',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Node hierarchy', () => {
  test('creates a top-level technology, a submodule under it, and rename/delete both', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });

    const tech = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'Java' });
    expect(tech.status).toBe(201);
    expect(tech.body.node.parentId).toBeNull();
    expect(tech.body.node.isLeaf).toBe(true);

    const sub = await request(app)
      .post('/api/nodes')
      .set(authHeader(token))
      .send({ name: 'Spring Boot', parentId: tech.body.node.id });
    expect(sub.status).toBe(201);
    expect(sub.body.node.parentId).toBe(tech.body.node.id);

    // The technology now has a child, so it's no longer a leaf.
    const techDetail = await request(app).get(`/api/nodes/${tech.body.node.id}`).set(authHeader(token));
    expect(techDetail.body.node.isLeaf).toBe(false);

    const rename = await request(app)
      .patch(`/api/nodes/${sub.body.node.id}`)
      .set(authHeader(token))
      .send({ name: 'Spring Framework' });
    expect(rename.status).toBe(200);
    expect(rename.body.node.name).toBe('Spring Framework');

    const del = await request(app).delete(`/api/nodes/${sub.body.node.id}`).set(authHeader(token));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/nodes').set(authHeader(token));
    expect(list.body.nodes.find((n) => n.id === sub.body.node.id)).toBeUndefined();
  });

  test('supports unlimited depth (Technology > Submodule > Child > Grandchild)', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });

    const l1 = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'DepthTech' });
    const l2 = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'DepthSub', parentId: l1.body.node.id });
    const l3 = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'DepthChild', parentId: l2.body.node.id });
    const l4 = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'DepthGrandchild', parentId: l3.body.node.id });
    expect(l4.status).toBe(201);

    const detail = await request(app).get(`/api/nodes/${l4.body.node.id}`).set(authHeader(token));
    expect(detail.body.node.path.map((p) => p.name)).toEqual(['DepthTech', 'DepthSub', 'DepthChild', 'DepthGrandchild']);
  });

  test('rejects duplicate sibling names at the same level (including top-level)', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'DupTech' });
    const dupe = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'DupTech' });
    expect(dupe.status).toBe(409);
  });

  test('allows the same name at different levels (not siblings)', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    const techA = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'TechA' });
    const techB = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'TechB' });

    const coreA = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'Core', parentId: techA.body.node.id });
    const coreB = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'Core', parentId: techB.body.node.id });
    expect(coreA.status).toBe(201);
    expect(coreB.status).toBe(201);
  });

  test('questions can only attach to a leaf node', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const parent = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'LeafTestParent' });
    await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'LeafTestChild', parentId: parent.body.node.id });

    // parent now has a child, so it is not a leaf
    const res = await createQuestion(token, parent.body.node.id);
    expect(res.status).toBe(400);
  });

  test('deleting a node cascades to archive its descendants', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    const parent = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'CascadeParent' });
    const child = await request(app)
      .post('/api/nodes')
      .set(authHeader(token))
      .send({ name: 'CascadeChild', parentId: parent.body.node.id });

    await request(app).delete(`/api/nodes/${parent.body.node.id}`).set(authHeader(token));

    const childDetail = await request(app).get(`/api/nodes/${child.body.node.id}`).set(authHeader(token));
    expect(childDetail.status).toBe(404);
  });

  test('node stats reflect question count', async () => {
    const { token } = await createTestUser({ role: ROLES.ADMIN });
    const node = await request(app).post('/api/nodes').set(authHeader(token)).send({ name: 'StatsNode' });
    await createQuestion(token, node.body.node.id);

    const detail = await request(app).get(`/api/nodes/${node.body.node.id}`).set(authHeader(token));
    expect(detail.body.node.questionCount).toBe(1);
  });
});
