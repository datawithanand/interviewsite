/* Seeds a sample multi-technology hierarchy and questions for local
 * exploration/demo, plus the default security-question template pool.
 * Run with: npm run seed
 */
require('dotenv').config();
const prisma = require('../src/db');
const { hashPassword } = require('../src/utils/password');
const { ROLES } = require('../src/utils/enums');

const DEFAULT_SECURITY_QUESTION_TEMPLATES = [
  'What was your first school?',
  'What is your favorite movie?',
  "What is your mother's maiden name?",
  'What was your childhood nickname?',
];

// Each top-level entry is a Technology. `children` nests Submodule / Child
// module entries to unlimited depth; only leaf entries carry `questions`.
const TECHNOLOGIES = [
  {
    name: 'ServiceNow',
    children: [
      {
        name: 'ITSM',
        children: [
          {
            name: 'Incident Management',
            questions: [
              {
                title: 'What is an Incident in ServiceNow?',
                format: 'TEXT',
                questionText: 'Define an incident and explain how it differs from a problem.',
                answerText:
                  'An incident is an unplanned interruption to a service or a reduction in quality of a service. It differs from a Problem, which is the underlying cause of one or more incidents.',
                difficulty: 'BEGINNER',
                tags: ['incident', 'itsm-core'],
              },
              {
                title: 'Auto-assign an incident based on category',
                format: 'CODE',
                codeLanguage: 'javascript',
                questionCode: '// Write a Business Rule (before insert) that sets the assignment\n// group when category is "Network".',
                answerCode:
                  "(function executeRule(current, previous) {\n  if (current.category == 'network') {\n    current.assignment_group = gs.getProperty('network_team_sys_id');\n  }\n})(current, previous);",
                difficulty: 'INTERMEDIATE',
                tags: ['incident', 'business-rule'],
              },
            ],
          },
          {
            name: 'Change Management',
            questions: [
              {
                title: 'Explain the three change types in ServiceNow',
                format: 'TEXT',
                questionText: 'What are Standard, Normal, and Emergency changes?',
                answerText:
                  'Standard changes are pre-approved, low-risk, repeatable. Normal changes require CAB approval and follow the full workflow. Emergency changes are made to resolve an incident quickly and are approved retroactively.',
                difficulty: 'BEGINNER',
                tags: ['change', 'itsm-core'],
              },
            ],
          },
        ],
      },
      {
        name: 'ITOM',
        children: [
          {
            name: 'Discovery',
            questions: [
              {
                title: 'What is Discovery in ITOM?',
                format: 'BOTH',
                codeLanguage: 'javascript',
                questionText: 'Explain what ServiceNow Discovery does, then show how to query discovered CIs.',
                questionCode:
                  "var gr = new GlideRecord('cmdb_ci_server');\ngr.addQuery('install_status', 1);\ngr.query();",
                answerText:
                  'Discovery scans the network to find and populate CIs in the CMDB automatically, using credentials and probes/sensors.',
                answerCode: "while (gr.next()) {\n  gs.info(gr.getValue('name'));\n}",
                difficulty: 'INTERMEDIATE',
                tags: ['itom', 'discovery'],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Python',
    children: [
      {
        name: 'Core Python',
        questions: [
          {
            title: 'What is the difference between a list and a tuple?',
            format: 'TEXT',
            questionText: 'Explain the key differences between list and tuple in Python.',
            answerText: 'Lists are mutable and defined with [], tuples are immutable and defined with (). Tuples are hashable if their contents are, so they can be used as dict keys; lists cannot.',
            difficulty: 'BEGINNER',
            tags: ['python', 'core'],
          },
        ],
      },
    ],
  },
];

async function createNodeChain(names, createdById) {
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
  return node;
}

async function seedTree(entry, parentPath, createdById) {
  const path = [...parentPath, entry.name];
  if (entry.questions) {
    const node = await createNodeChain(path, createdById);
    for (const q of entry.questions) {
      const serialNumber = node.nextSerial;
      // eslint-disable-next-line no-await-in-loop
      const clash = await prisma.question.findUnique({ where: { nodeId_serialNumber: { nodeId: node.id, serialNumber } } });
      if (clash) continue;
      // eslint-disable-next-line no-await-in-loop
      await prisma.question.create({
        data: {
          nodeId: node.id,
          serialNumber,
          title: q.title,
          format: q.format,
          codeLanguage: q.codeLanguage || null,
          questionText: q.questionText || null,
          questionCode: q.questionCode || null,
          answerText: q.answerText || null,
          answerCode: q.answerCode || null,
          difficulty: q.difficulty,
          tags: JSON.stringify(q.tags || []),
          createdById,
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.node.update({ where: { id: node.id }, data: { nextSerial: serialNumber + 1 } });
    }
  }
  if (entry.children) {
    for (const child of entry.children) {
      // eslint-disable-next-line no-await-in-loop
      await seedTree(child, path, createdById);
    }
  }
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

  for (const tech of TECHNOLOGIES) {
    // eslint-disable-next-line no-await-in-loop
    await seedTree(tech, [], admin.id);
  }

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
