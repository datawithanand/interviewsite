const request = require('supertest');
const { buildApp, createTestUser, authHeader, prisma } = require('./helpers');
const { ROLES } = require('../src/utils/enums');

const app = buildApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Saved searches', () => {
  test('create, list, and delete a saved search', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });

    const create = await request(app)
      .post('/api/saved-searches')
      .set(authHeader(token))
      .send({ name: 'Hard CMDB questions', filters: { difficulty: 'ADVANCED', q: 'cmdb' } });
    expect(create.status).toBe(201);

    const list = await request(app).get('/api/saved-searches').set(authHeader(token));
    expect(list.body.savedSearches.length).toBe(1);
    expect(list.body.savedSearches[0].filters.difficulty).toBe('ADVANCED');

    const del = await request(app)
      .delete(`/api/saved-searches/${create.body.savedSearch.id}`)
      .set(authHeader(token));
    expect(del.status).toBe(204);

    const listAfter = await request(app).get('/api/saved-searches').set(authHeader(token));
    expect(listAfter.body.savedSearches.length).toBe(0);
  });

  test('rejects duplicate names for the same user', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    await request(app).post('/api/saved-searches').set(authHeader(token)).send({ name: 'My Filter', filters: {} });
    const dupe = await request(app).post('/api/saved-searches').set(authHeader(token)).send({ name: 'My Filter', filters: {} });
    expect(dupe.status).toBe(409);
  });

  test('saved searches are scoped per user', async () => {
    const { token: tokenA } = await createTestUser({ role: ROLES.REGULAR_USER });
    const { token: tokenB } = await createTestUser({ role: ROLES.REGULAR_USER });
    await request(app).post('/api/saved-searches').set(authHeader(tokenA)).send({ name: 'A only', filters: {} });

    const listB = await request(app).get('/api/saved-searches').set(authHeader(tokenB));
    expect(listB.body.savedSearches.length).toBe(0);
  });
});
