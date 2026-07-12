/* Seeds the real ServiceNow interview-question bank (232 questions, migrated
 * from a prior personal site and reclassified into this app's Technology >
 * Submodule > Topic hierarchy — see prisma/data/servicenow-questions.json),
 * plus the default security-question template pool. Run with: npm run seed
 *
 * Safe to re-run: each row is skipped if a question with the same title
 * already exists under its target node, so it won't duplicate on a second run.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const prisma = require('../src/db');
const { hashPassword } = require('../src/utils/password');
const { ROLES } = require('../src/utils/enums');

const DEFAULT_SECURITY_QUESTION_TEMPLATES = [
  'What was your first school?',
  'What is your favorite movie?',
  "What is your mother's maiden name?",
  'What was your childhood nickname?',
];

const QUESTIONS_FILE = path.join(__dirname, 'data', 'servicenow-questions.json');
const PATH_SEPARATOR = ' > ';

async function createNodeChain(names, createdById, cache) {
  const key = names.join(PATH_SEPARATOR);
  if (cache.has(key)) return cache.get(key);
  let parentId = null;
  let node = null;
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    node = await prisma.node.findFirst({ where: { name, parentId, isArchived: false } });
    if (!node) {
      // eslint-disable-next-line no-await-in-loop
      node = await prisma.node.create({ data: { name, parentId, createdById } });
    }
    parentId = node.id;
  }
  cache.set(key, node);
  return node;
}

async function seedQuestions(createdById) {
  const { rows } = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
  const nodeCache = new Map();
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const segments = row.nodePath.split(PATH_SEPARATOR);
    // eslint-disable-next-line no-await-in-loop
    const node = await createNodeChain(segments, createdById, nodeCache);

    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.question.findFirst({ where: { nodeId: node.id, title: row.title } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const serialNumber = node.nextSerial;
    // eslint-disable-next-line no-await-in-loop
    await prisma.question.create({
      data: {
        nodeId: node.id,
        serialNumber,
        title: row.title,
        format: row.format,
        codeLanguage: row.codeLanguage || null,
        questionText: row.questionText || null,
        questionCode: row.questionCode || null,
        answerText: row.answerText || null,
        answerCode: row.answerCode || null,
        difficulty: row.difficulty,
        tags: JSON.stringify(row.tags || []),
        createdById,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    await prisma.node.update({ where: { id: node.id }, data: { nextSerial: serialNumber + 1 } });
    node.nextSerial = serialNumber + 1;
    created += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`Questions seeded: ${created} created, ${skipped} already present.`);
}

async function main() {
  for (const question of DEFAULT_SECURITY_QUESTION_TEMPLATES) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.securityQuestionTemplate.findUnique({ where: { question } });
    // eslint-disable-next-line no-await-in-loop
    if (!existing) await prisma.securityQuestionTemplate.create({ data: { question } });
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: ROLES.ADMIN } });
  let admin = existingAdmin;

  if (!admin) {
    const passwordHash = await hashPassword('AdminPass123');
    const securityAnswerHash = await hashPassword('metropolis');
    admin = await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        role: ROLES.ADMIN,
        securityQuestion: 'What was your first school?',
        securityAnswerHash,
      },
    });
    // eslint-disable-next-line no-console
    console.log('Created seed admin user: admin / AdminPass123 (change this immediately)');
  }

  await seedQuestions(admin.id);

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
