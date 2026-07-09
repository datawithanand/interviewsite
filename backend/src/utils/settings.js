const prisma = require('../db');

const SINGLETON_ID = 'singleton';

const DEFAULTS = {
  id: SINGLETON_ID,
  passwordMinLength: 8,
  passwordRequireLetter: true,
  passwordRequireNumber: true,
  maxFailedLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  sessionTimeoutMinutes: 480,
  registrationEnabled: true,
};

let cache = null;

// Settings are read on nearly every auth-related request (password checks,
// lockout thresholds, session expiry), so cache in-process and invalidate
// explicitly on update rather than hitting the DB every time.
async function getSettings() {
  if (cache) return cache;
  let row = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    row = await prisma.settings.create({ data: DEFAULTS }).catch(async () => {
      // Another concurrent request may have created it first.
      return prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
    });
  }
  cache = row;
  return row;
}

async function updateSettings(data, updatedById) {
  const row = await prisma.settings.upsert({
    where: { id: SINGLETON_ID },
    create: { ...DEFAULTS, ...data, updatedById },
    update: { ...data, updatedById },
  });
  cache = row;
  return row;
}

function invalidateSettingsCache() {
  cache = null;
}

module.exports = { getSettings, updateSettings, invalidateSettingsCache, SINGLETON_ID };
