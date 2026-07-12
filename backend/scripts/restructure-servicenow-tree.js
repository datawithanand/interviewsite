/* One-time migration for databases seeded before the ServiceNow tree was
 * restructured: nests the platform-level submodules (Data Management,
 * General & Behavioral, Integrations & APIs, Scripting & Automation,
 * Security & ACLs, Service Catalog, Workflow & Flow Designer) under ITSM
 * instead of sitting as ServiceNow's direct children. Only re-parents
 * existing nodes — no questions are touched, moved, or duplicated, and
 * nothing is lost.
 *
 * Safe to re-run: nodes already under ITSM are left alone.
 * Run with: node scripts/restructure-servicenow-tree.js
 */
require('dotenv').config();
const prisma = require('../src/db');

const SUBMODULES_TO_NEST = [
  'Data Management',
  'General & Behavioral',
  'Integrations & APIs',
  'Scripting & Automation',
  'Security & ACLs',
  'Service Catalog',
  'Workflow & Flow Designer',
];

async function main() {
  const serviceNow = await prisma.node.findFirst({ where: { name: 'ServiceNow', parentId: null } });
  if (!serviceNow) {
    console.log('No "ServiceNow" top-level node found — nothing to migrate.');
    return;
  }

  const itsm = await prisma.node.findFirst({ where: { name: 'ITSM', parentId: serviceNow.id } });
  if (!itsm) {
    console.log('No "ITSM" node found under ServiceNow — nothing to migrate.');
    return;
  }

  let moved = 0;
  let alreadyDone = 0;

  for (const name of SUBMODULES_TO_NEST) {
    const underServiceNow = await prisma.node.findFirst({ where: { name, parentId: serviceNow.id } });
    if (underServiceNow) {
      await prisma.node.update({ where: { id: underServiceNow.id }, data: { parentId: itsm.id } });
      console.log(`Moved "${name}" under ITSM.`);
      moved += 1;
      continue;
    }
    const underItsm = await prisma.node.findFirst({ where: { name, parentId: itsm.id } });
    if (underItsm) {
      alreadyDone += 1;
    } else {
      console.log(`"${name}" not found under ServiceNow or ITSM — skipped.`);
    }
  }

  console.log(`Done. Moved: ${moved}, already nested: ${alreadyDone}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
