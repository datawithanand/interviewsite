const { v4: uuid } = require('uuid');
const createApp = require('../src/app');
const prisma = require('../src/db');
const { hashPassword } = require('../src/utils/password');
const { createSession } = require('../src/utils/session');
const { ROLES } = require('../src/utils/enums');

function buildApp() {
  return createApp();
}

async function createTestUser({ role = ROLES.REGULAR_USER, username } = {}) {
  const uname = username || `user_${uuid().slice(0, 8)}`;
  const password = 'TestPass123';
  const passwordHash = await hashPassword(password);

  const securityAnswers = [
    { question: 'First pet name?', answer: 'fluffy' },
    { question: 'Favorite color?', answer: 'blue' },
    { question: 'Birth city?', answer: 'metropolis' },
  ];

  const user = await prisma.user.create({
    data: {
      username: uname,
      passwordHash,
      role,
      securityQuestions: {
        create: await Promise.all(
          securityAnswers.map(async (sq) => ({
            question: sq.question,
            answerHash: await hashPassword(sq.answer),
          }))
        ),
      },
    },
  });

  const { token } = await createSession(user, { ipAddress: '127.0.0.1', userAgent: 'jest' });
  return { user, token, password, securityAnswers };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createTestModule({ name, createdById } = {}) {
  return prisma.module.create({
    data: { name: name || `Module ${uuid().slice(0, 8)}`, createdById: createdById || null },
  });
}

module.exports = { buildApp, createTestUser, authHeader, createTestModule, prisma };
