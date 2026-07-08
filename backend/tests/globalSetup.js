const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
  // Prisma resolves a relative sqlite URL against schema.prisma's directory
  // (prisma/), not the process cwd — so the file lands at prisma/test.db.
  const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  execSync('npx prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
};
