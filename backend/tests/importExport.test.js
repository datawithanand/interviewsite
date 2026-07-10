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
      title: 'Export sample',
      format: 'TEXT',
      questionText: 'question text',
      answerText: 'answer text',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Import/Export', () => {
  test('regular user cannot access export', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).get('/api/import-export/export').query({ format: 'json' }).set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test('exports questions as JSON preserving serial numbers, keyed by full node path', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const tech = await createTestNode({ name: 'ExportTech' });
    const leaf = await createTestNode({ name: 'ExportLeaf', parentId: tech.id });
    await createQuestion(token, leaf.id, { title: 'E1' });
    await createQuestion(token, leaf.id, { title: 'E2' });

    const res = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'json', nodeIds: tech.id })
      .set(authHeader(token));
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.text);
    const entry = parsed.nodes.find((n) => n.nodePath === 'ExportTech > ExportLeaf');
    expect(entry).toBeDefined();
    expect(entry.questions.map((q) => q.serialNumber)).toEqual([1, 2]);
  });

  test('exports questions as CSV, XLSX, Markdown, and PDF without error', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const leaf = await createTestNode({ name: 'ExportMultiFormat' });
    await createQuestion(token, leaf.id);

    for (const format of ['csv', 'xlsx', 'md', 'pdf']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .get('/api/import-export/export')
        .query({ format, nodeIds: leaf.id })
        .set(authHeader(token));
      expect(res.status).toBe(200);
    }
  });

  test('CSV export neutralizes formula-injection payloads', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const leaf = await createTestNode({ name: 'ExportInjection' });
    await createQuestion(token, leaf.id, { title: '=1+1', questionText: 'safe', answerText: '@SUM(A1)' });

    const res = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'csv', nodeIds: leaf.id })
      .set(authHeader(token));
    expect(res.text).toContain("'=1+1");
    expect(res.text).toContain("'@SUM(A1)");
  });

  test('import preview parses a CSV upload and reports validation errors', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const csv = [
      'serialNumber,nodePath,title,format,codeLanguage,questionText,questionCode,answerText,answerCode,difficulty,tags',
      '1,ImportTech > ImportMod,Valid Q,TEXT,,What is ITSM?,,It is a framework.,,BEGINNER,itsm',
      '2,ImportTech > ImportMod,,TEXT,,Missing title,,answer,,BEGINNER,',
    ].join('\n');

    const res = await request(app)
      .post('/api/import-export/import/preview')
      .set(authHeader(token))
      .attach('files', Buffer.from(csv), 'import.csv');

    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(1);
    expect(res.body.invalidCount).toBe(1);
  });

  test('import commit creates the full node chain and preserves explicit serial numbers with gaps', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const pathStr = `CommitTech_${Date.now()} > CommitMod`;

    const res = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [
          { serialNumber: 1, nodePath: pathStr, title: 'Q1', format: 'TEXT', questionText: 'q1', answerText: 'a1', difficulty: 'BEGINNER', tags: [] },
          { serialNumber: 5, nodePath: pathStr, title: 'Q5', format: 'TEXT', questionText: 'q5', answerText: 'a5', difficulty: 'BEGINNER', tags: [] },
        ],
        conflictResolution: 'skip',
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);

    const [techName, modName] = pathStr.split(' > ');
    const tech = await prisma.node.findFirst({ where: { name: techName, parentId: null } });
    const mod = await prisma.node.findFirst({ where: { name: modName, parentId: tech.id } });
    const questions = await prisma.question.findMany({ where: { nodeId: mod.id } });
    const serials = questions.map((q) => q.serialNumber).sort((a, b) => a - b);
    expect(serials).toEqual([1, 5]); // gap preserved
  });

  test('import commit conflict resolution: skip, overwrite, renumber', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const pathStr = `ConflictTech_${Date.now()} > ConflictMod`;

    await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, nodePath: pathStr, title: 'Original', format: 'TEXT', questionText: 'q', answerText: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'skip',
      });

    const skipRes = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, nodePath: pathStr, title: 'ShouldBeSkipped', format: 'TEXT', questionText: 'q', answerText: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'skip',
      });
    expect(skipRes.body.skipped).toBe(1);
    expect(skipRes.body.imported).toBe(0);

    const overwriteRes = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, nodePath: pathStr, title: 'Overwritten', format: 'TEXT', questionText: 'q', answerText: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'overwrite',
      });
    expect(overwriteRes.body.overwritten).toBe(1);

    const [techName, modName] = pathStr.split(' > ');
    const tech = await prisma.node.findFirst({ where: { name: techName, parentId: null } });
    const mod = await prisma.node.findFirst({ where: { name: modName, parentId: tech.id } });
    const q1 = await prisma.question.findUnique({ where: { nodeId_serialNumber: { nodeId: mod.id, serialNumber: 1 } } });
    expect(q1.title).toBe('Overwritten');

    const renumberRes = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, nodePath: pathStr, title: 'Renumbered', format: 'TEXT', questionText: 'q', answerText: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'renumber',
      });
    expect(renumberRes.body.imported).toBe(1);

    const allQuestions = await prisma.question.findMany({ where: { nodeId: mod.id } });
    expect(allQuestions.some((q) => q.title === 'Renumbered' && q.serialNumber !== 1)).toBe(true);
  });

  test('import/export activity is recorded in history', async () => {
    const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER });
    const leaf = await createTestNode({ name: 'HistoryNode' });
    await createQuestion(token, leaf.id);
    await request(app).get('/api/import-export/export').query({ format: 'json', nodeIds: leaf.id }).set(authHeader(token));

    const history = await request(app).get('/api/import-export/history').set(authHeader(token));
    expect(history.status).toBe(200);
    expect(history.body.history.some((h) => h.action === 'export')).toBe(true);
  });

  describe('Full-database export', () => {
    test('non-admin cannot access it', async () => {
      const { token } = await createTestUser({ role: ROLES.CONTENT_MANAGER, username: 'fulldump_cm' });
      const res = await request(app)
        .post('/api/import-export/export/full-database')
        .set(authHeader(token))
        .send({ password: 'TestPass123' });
      expect(res.status).toBe(403);
    });

    test('admin must re-confirm their password', async () => {
      const { token } = await createTestUser({ role: ROLES.ADMIN, username: 'fulldump_admin' });
      const wrongPw = await request(app)
        .post('/api/import-export/export/full-database')
        .set(authHeader(token))
        .send({ password: 'WrongPassword1' });
      expect(wrongPw.status).toBe(401);

      const rightPw = await request(app)
        .post('/api/import-export/export/full-database')
        .set(authHeader(token))
        .send({ password: 'TestPass123' });
      expect(rightPw.status).toBe(200);
      const dump = JSON.parse(rightPw.text);
      expect(dump.tables.users.length).toBeGreaterThan(0);
      expect(dump.tables.users[0]).toHaveProperty('passwordHash');
    });

    test('full-database export writes a FULL_EXPORT audit log entry', async () => {
      const { token, user } = await createTestUser({ role: ROLES.ADMIN, username: 'fulldump_audit' });
      await request(app).post('/api/import-export/export/full-database').set(authHeader(token)).send({ password: 'TestPass123' });

      const logs = await prisma.auditLog.findMany({ where: { userId: user.id, action: 'FULL_EXPORT' } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
