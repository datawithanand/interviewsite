/* Seeds sample ServiceNow modules and questions for local exploration/demo.
 * Run with: npm run seed
 */
require('dotenv').config();
const prisma = require('../src/db');
const { hashPassword } = require('../src/utils/password');
const { ROLES } = require('../src/utils/enums');

const MODULES = [
  {
    name: 'Incident Management',
    description: 'Restoring normal service operation as quickly as possible.',
    questions: [
      {
        title: 'What is an Incident in ServiceNow?',
        content: 'Define an incident and explain how it differs from a problem.',
        format: 'TEXT',
        answer:
          'An incident is an unplanned interruption to a service or a reduction in quality of a service. It differs from a Problem, which is the underlying cause of one or more incidents.',
        difficulty: 'BEGINNER',
        tags: ['incident', 'itsm-core'],
      },
      {
        title: 'Write a script to auto-assign an incident based on category',
        content: 'Write a Business Rule (before insert) that sets the assignment group when category is "Network".',
        format: 'CODE',
        codeLanguage: 'javascript',
        answer:
          "(function executeRule(current, previous) {\n  if (current.category == 'network') {\n    current.assignment_group = gs.getProperty('network_team_sys_id');\n  }\n})(current, previous);",
        difficulty: 'INTERMEDIATE',
        tags: ['incident', 'business-rule'],
      },
    ],
  },
  {
    name: 'Change Management',
    description: 'Controlling the lifecycle of changes to IT services.',
    questions: [
      {
        title: 'Explain the three change types in ServiceNow',
        content: 'What are Standard, Normal, and Emergency changes?',
        format: 'TEXT',
        answer:
          'Standard changes are pre-approved, low-risk, repeatable. Normal changes require CAB approval and follow the full workflow. Emergency changes are made to resolve an incident quickly and are approved retroactively.',
        difficulty: 'BEGINNER',
        tags: ['change', 'itsm-core'],
      },
    ],
  },
  {
    name: 'CMDB',
    description: 'Configuration Management Database — tracking configuration items and their relationships.',
    questions: [
      {
        title: 'Query all active Configuration Items of class cmdb_ci_server',
        content: 'Write a GlideRecord query to fetch all active servers.',
        format: 'CODE',
        codeLanguage: 'javascript',
        answer:
          "var gr = new GlideRecord('cmdb_ci_server');\ngr.addQuery('install_status', 1);\ngr.query();\nwhile (gr.next()) {\n  gs.info(gr.getValue('name'));\n}",
        difficulty: 'INTERMEDIATE',
        tags: ['cmdb', 'gliderecord'],
      },
    ],
  },
  {
    name: 'Service Catalog',
    description: 'Structured list of IT services and offerings available to end users.',
    questions: [
      {
        title: 'What is a Catalog Item vs a Record Producer?',
        content: 'Explain the difference between a Catalog Item and a Record Producer in the Service Catalog.',
        format: 'TEXT',
        answer:
          'A Catalog Item typically creates a Request/RITM through the standard ordering process. A Record Producer lets users create a record in any table (e.g. an Incident) directly from the catalog, using a custom form.',
        difficulty: 'ADVANCED',
        tags: ['service-catalog'],
      },
    ],
  },
];

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: ROLES.ADMIN } });
  let admin = existingAdmin;

  if (!admin) {
    const passwordHash = await hashPassword('AdminPass123');
    admin = await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        role: ROLES.ADMIN,
        securityQuestions: {
          create: [
            { question: 'What is your favorite ServiceNow module?', answerHash: await hashPassword('cmdb') },
            { question: 'What city were you born in?', answerHash: await hashPassword('metropolis') },
            { question: 'What is your favorite color?', answerHash: await hashPassword('blue') },
          ],
        },
      },
    });
    // eslint-disable-next-line no-console
    console.log('Created seed admin user: admin / AdminPass123 (change this immediately)');
  }

  for (const mod of MODULES) {
    const existing = await prisma.module.findUnique({ where: { name: mod.name } });
    const module =
      existing ||
      (await prisma.module.create({ data: { name: mod.name, description: mod.description, createdById: admin.id } }));

    for (const q of mod.questions) {
      const serialNumber = module.nextSerial;
      const clash = await prisma.question.findUnique({
        where: { moduleId_serialNumber: { moduleId: module.id, serialNumber } },
      });
      if (clash) continue;

      await prisma.question.create({
        data: {
          moduleId: module.id,
          serialNumber,
          title: q.title,
          content: q.content,
          format: q.format,
          codeLanguage: q.codeLanguage || null,
          answer: q.answer,
          difficulty: q.difficulty,
          tags: JSON.stringify(q.tags || []),
          createdById: admin.id,
        },
      });
      await prisma.module.update({ where: { id: module.id }, data: { nextSerial: serialNumber + 1 } });
    }
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
