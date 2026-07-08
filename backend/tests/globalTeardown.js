const path = require('path');
const fs = require('fs');

module.exports = async () => {
  const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
};
