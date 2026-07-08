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
      title: 'Export sample',
      content: 'content',
      format: 'TEXT',
      answer: 'answer',
      difficulty: 'BEGINNER',
      ...overrides,
    });
}

describe('Import/Export', () => {
  test('regular user cannot access import/export', async () => {
    const { token } = await createTestUser({ role: ROLES.REGULAR_USER });
    const res = await request(app).get('/api/import-export/export').query({ format: 'json' }).set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test('exports questions as JSON preserving serial numbers', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule({ name: 'ExportMod JSON' });
    await createQuestion(token, mod.id, { title: 'E1' });
    await createQuestion(token, mod.id, { title: 'E2' });

    const res = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'json', moduleIds: mod.id })
      .set(authHeader(token));
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.text);
    const moduleEntry = parsed.modules.find((m) => m.module === mod.name);
    expect(moduleEntry.questions.map((q) => q.serialNumber)).toEqual([1, 2]);
  });

  test('exports questions as CSV', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule({ name: 'ExportMod CSV' });
    await createQuestion(token, mod.id);

    const res = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'csv', moduleIds: mod.id })
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('serialNumber');
  });

  test('exports questions as XLSX and PDF without error', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule({ name: 'ExportMod Bin' });
    await createQuestion(token, mod.id);

    const xlsx = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'xlsx', moduleIds: mod.id })
      .set(authHeader(token));
    expect(xlsx.status).toBe(200);

    const pdf = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'pdf', moduleIds: mod.id })
      .set(authHeader(token));
    expect(pdf.status).toBe(200);
  });

  test('CSV export neutralizes formula-injection payloads', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule({ name: 'ExportMod Injection' });
    await createQuestion(token, mod.id, { title: '=1+1', content: 'safe', answer: '@SUM(A1)' });

    const res = await request(app)
      .get('/api/import-export/export')
      .query({ format: 'csv', moduleIds: mod.id })
      .set(authHeader(token));
    expect(res.text).toContain("'=1+1");
    expect(res.text).toContain("'@SUM(A1)");
  });

  test('import preview parses a CSV upload and reports validation errors', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const csv = [
      'serialNumber,module,title,content,format,codeLanguage,answer,difficulty,tags',
      '1,ImportMod,Valid Q,What is ITSM?,TEXT,,It is a framework.,BEGINNER,itsm',
      '2,ImportMod,,Missing title,TEXT,,answer,BEGINNER,',
    ].join('\n');

    const res = await request(app)
      .post('/api/import-export/import/preview')
      .set(authHeader(token))
      .attach('files', Buffer.from(csv), 'import.csv');

    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(1);
    expect(res.body.invalidCount).toBe(1);
  });

  test('import commit creates questions preserving explicit serial numbers and gaps', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const moduleName = `ImportCommitMod_${Date.now()}`;

    const res = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [
          { serialNumber: 1, module: moduleName, title: 'Q1', content: 'c1', format: 'TEXT', answer: 'a1', difficulty: 'BEGINNER', tags: [] },
          { serialNumber: 5, module: moduleName, title: 'Q5', content: 'c5', format: 'TEXT', answer: 'a5', difficulty: 'BEGINNER', tags: [] },
        ],
        conflictResolution: 'skip',
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);

    const mod = await prisma.module.findUnique({ where: { name: moduleName }, include: { questions: true } });
    const serials = mod.questions.map((q) => q.serialNumber).sort((a, b) => a - b);
    expect(serials).toEqual([1, 5]); // gap preserved
  });

  test('import commit conflict resolution: skip, overwrite, renumber', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const moduleName = `ImportConflictMod_${Date.now()}`;

    await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, module: moduleName, title: 'Original', content: 'c', format: 'TEXT', answer: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'skip',
      });

    const skipRes = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, module: moduleName, title: 'ShouldBeSkipped', content: 'c', format: 'TEXT', answer: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'skip',
      });
    expect(skipRes.body.skipped).toBe(1);
    expect(skipRes.body.imported).toBe(0);

    const overwriteRes = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, module: moduleName, title: 'Overwritten', content: 'c', format: 'TEXT', answer: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'overwrite',
      });
    expect(overwriteRes.body.overwritten).toBe(1);

    const mod1 = await prisma.module.findUnique({ where: { name: moduleName }, include: { questions: true } });
    expect(mod1.questions.find((q) => q.serialNumber === 1).title).toBe('Overwritten');

    const renumberRes = await request(app)
      .post('/api/import-export/import/commit')
      .set(authHeader(token))
      .send({
        rows: [{ serialNumber: 1, module: moduleName, title: 'Renumbered', content: 'c', format: 'TEXT', answer: 'a', difficulty: 'BEGINNER' }],
        conflictResolution: 'renumber',
      });
    expect(renumberRes.body.imported).toBe(1);

    const mod2 = await prisma.module.findUnique({ where: { name: moduleName }, include: { questions: true } });
    expect(mod2.questions.some((q) => q.title === 'Renumbered' && q.serialNumber !== 1)).toBe(true);
  });

  test('import/export activity is recorded in history', async () => {
    const { token } = await createTestUser({ role: ROLES.WRITER });
    const mod = await createTestModule({ name: 'HistoryMod' });
    await createQuestion(token, mod.id);
    await request(app).get('/api/import-export/export').query({ format: 'json', moduleIds: mod.id }).set(authHeader(token));

    const history = await request(app).get('/api/import-export/history').set(authHeader(token));
    expect(history.status).toBe(200);
    expect(history.body.history.some((h) => h.action === 'export')).toBe(true);
  });
});
