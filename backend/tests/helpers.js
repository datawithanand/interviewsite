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
  const securityQuestion = 'First pet name?';
  const securityAnswer = 'fluffy';
  const securityAnswerHash = await hashPassword(securityAnswer);

  const user = await prisma.user.create({
    data: { username: uname, passwordHash, role, securityQuestion, securityAnswerHash },
  });

  const { token } = await createSession(user, { ipAddress: '127.0.0.1', userAgent: 'jest' });
  return { user, token, password, securityQuestion, securityAnswer };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// Creates a leaf Node ready to hold questions. `parentId` lets tests build
// multi-level chains (Technology -> Submodule -> Child) when needed.
async function createTestNode({ name, parentId, createdById } = {}) {
  return prisma.node.create({
    data: { name: name || `Node ${uuid().slice(0, 8)}`, parentId: parentId || null, createdById: createdById || null },
  });
}

module.exports = { buildApp, createTestUser, authHeader, createTestNode, prisma };
