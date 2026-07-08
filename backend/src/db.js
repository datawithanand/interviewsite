const { PrismaClient } = require('@prisma/client');

// SQLite allows only one writer at a time; under concurrent writes Prisma's
// default 5s transaction timeout is too tight and surfaces as P1008/P2028
// errors. Raise it, and set a busy_timeout so SQLite itself blocks/retries
// on a locked database instead of failing immediately. Postgres deployments
// are unaffected — MULTI-writer, no equivalent SQLite lock contention.
const prisma = new PrismaClient({
  transactionOptions: { maxWait: 15000, timeout: 15000 },
});

prisma.$executeRawUnsafe('PRAGMA busy_timeout = 10000;').catch(() => {});

module.exports = prisma;
