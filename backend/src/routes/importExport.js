const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireContentManagerOrAdmin, requireAdmin } = require('../middleware/rbac');
const { validate } = require('../utils/validation');
const { verifyPassword } = require('../utils/password');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, QUESTION_FORMATS, DIFFICULTIES } = require('../utils/enums');
const { getDescendantIds, getNodePath, pathToString } = require('../utils/nodeHelpers');
const fmt = require('../utils/importExportFormats');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.json', '.csv', '.xlsx', '.xml'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Unsupported file type. Allowed: json, csv, xlsx, xml.'));
    cb(null, true);
  },
});

router.use(authenticate);

// ---------- Export (content: questions across the hierarchy) ----------

const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx', 'xml', 'pdf', 'md']),
  nodeIds: z.string().optional(), // comma-separated node ids; every question under these subtrees is included
  questionIds: z.string().optional(), // comma-separated question ids; exact selection, takes precedence over nodeIds
});

router.get('/export', requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const q = validate(exportQuerySchema, req.query);

    let questions;
    if (q.questionIds) {
      const ids = q.questionIds.split(',').filter(Boolean);
      questions = await prisma.question.findMany({ where: { id: { in: ids } }, orderBy: { serialNumber: 'asc' } });
    } else if (q.nodeIds) {
      const rootIds = q.nodeIds.split(',').filter(Boolean);
      const allIds = new Set();
      for (const id of rootIds) {
        // eslint-disable-next-line no-await-in-loop
        const descendants = await getDescendantIds(id);
        descendants.forEach((d) => allIds.add(d));
      }
      questions = await prisma.question.findMany({ where: { nodeId: { in: [...allIds] } }, orderBy: { serialNumber: 'asc' } });
    } else {
      questions = await prisma.question.findMany({ where: { node: { isArchived: false } }, orderBy: { serialNumber: 'asc' } });
    }

    const questionsByPath = {};
    for (const question of questions) {
      // eslint-disable-next-line no-await-in-loop
      const path = await getNodePath(question.nodeId);
      const pathStr = pathToString(path) || 'Unknown';
      if (!questionsByPath[pathStr]) questionsByPath[pathStr] = [];
      questionsByPath[pathStr].push(question);
    }

    let buffer;
    let contentType;
    let filename;

    switch (q.format) {
      case 'json':
        buffer = fmt.toJson(questionsByPath);
        contentType = 'application/json';
        filename = 'questions-export.json';
        break;
      case 'csv':
        buffer = fmt.toCsv(questionsByPath);
        contentType = 'text/csv';
        filename = 'questions-export.csv';
        break;
      case 'xlsx':
        buffer = await fmt.toXlsx(questionsByPath);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'questions-export.xlsx';
        break;
      case 'xml':
        buffer = fmt.toXml(questionsByPath);
        contentType = 'application/xml';
        filename = 'questions-export.xml';
        break;
      case 'md':
        buffer = fmt.toMarkdown(questionsByPath);
        contentType = 'text/markdown';
        filename = 'questions-export.md';
        break;
      case 'pdf':
        buffer = await fmt.toPdf(questionsByPath);
        contentType = 'application/pdf';
        filename = 'questions-export.pdf';
        break;
      default:
        return res.status(400).json({ error: 'Unsupported format.' });
    }

    await prisma.importExport.create({
      data: {
        userId: req.user.id,
        action: 'export',
        fileName: filename,
        fileFormat: q.format,
        recordCount: questions.length,
        nodesIncluded: JSON.stringify(Object.keys(questionsByPath)),
        status: 'success',
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EXPORT,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      details: { format: q.format, recordCount: questions.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ---------- Full database export (admin only, highly sensitive) ----------
// Dumps every table as JSON, including password hashes and security-answer
// hashes. Gated behind: admin role, re-entering your own password, and a
// dedicated FULL_EXPORT audit entry every time it's used.

const fullExportSchema = z.object({ password: z.string().min(1) });

router.post('/export/full-database', requireAdmin, async (req, res, next) => {
  try {
    const data = validate(fullExportSchema, req.body);
    const valid = await verifyPassword(data.password, req.user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect.' });

    const [
      users,
      nodes,
      questions,
      questionVersions,
      favorites,
      comments,
      notifications,
      savedSearches,
      auditLogs,
      importsExports,
      sessions,
      settings,
      securityQuestionTemplates,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.node.findMany(),
      prisma.question.findMany(),
      prisma.questionVersion.findMany(),
      prisma.favorite.findMany(),
      prisma.comment.findMany(),
      prisma.notification.findMany(),
      prisma.savedSearch.findMany(),
      prisma.auditLog.findMany(),
      prisma.importExport.findMany(),
      prisma.session.findMany(),
      prisma.settings.findMany(),
      prisma.securityQuestionTemplate.findMany(),
    ]);

    const dump = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.username,
      tables: {
        users,
        nodes,
        questions,
        questionVersions,
        favorites,
        comments,
        notifications,
        savedSearches,
        auditLogs,
        importsExports,
        sessions,
        settings,
        securityQuestionTemplates,
      },
    };

    const filename = `full-database-export-${Date.now()}.json`;

    await prisma.importExport.create({
      data: {
        userId: req.user.id,
        action: 'export',
        fileName: filename,
        fileFormat: 'json',
        recordCount: users.length + questions.length,
        nodesIncluded: JSON.stringify(['ALL']),
        status: 'success',
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.FULL_EXPORT,
      targetType: AUDIT_TARGET_TYPES.DATABASE,
      details: { userCount: users.length, questionCount: questions.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    next(err);
  }
});

// ---------- Import: preview (parse + validate, no DB writes) ----------

function parseFile(file) {
  const ext = '.' + file.originalname.split('.').pop().toLowerCase();
  switch (ext) {
    case '.json':
      return fmt.fromJson(file.buffer);
    case '.csv':
      return fmt.fromCsv(file.buffer);
    case '.xlsx':
      return fmt.fromXlsx(file.buffer);
    case '.xml':
      return fmt.fromXml(file.buffer);
    default:
      throw Object.assign(new Error('Unsupported file type.'), { statusCode: 400 });
  }
}

function validateRow(rawRow, index) {
  const row = fmt.normalizeRow(rawRow);
  const errors = [];
  if (!row.nodePath) errors.push('nodePath is required');
  if (!row.title) errors.push('title is required');
  if (!Object.values(QUESTION_FORMATS).includes(row.format)) errors.push(`invalid format "${row.format}"`);
  if (!Object.values(DIFFICULTIES).includes(row.difficulty)) errors.push(`invalid difficulty "${row.difficulty}"`);
  if (row.format === 'TEXT' && (!row.questionText || !row.answerText)) {
    errors.push('questionText and answerText are required for TEXT format');
  }
  if (row.format === 'CODE' && (!row.questionCode || !row.answerCode)) {
    errors.push('questionCode and answerCode are required for CODE format');
  }
  if (row.format === 'BOTH' && (!row.questionText || !row.questionCode || !row.answerText || !row.answerCode)) {
    errors.push('questionText, questionCode, answerText, and answerCode are all required for BOTH format');
  }
  if ((row.format === 'CODE' || row.format === 'BOTH') && !row.codeLanguage) {
    errors.push('codeLanguage is required for CODE/BOTH format');
  }
  return { row, index, errors };
}

router.post('/import/preview', requireContentManagerOrAdmin, upload.array('files', 5), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });

    const allRows = [];
    for (const file of req.files) {
      let parsedRows;
      try {
        parsedRows = await parseFile(file);
      } catch (e) {
        return res.status(400).json({ error: `Failed to parse ${file.originalname}: ${e.message}` });
      }
      parsedRows.forEach((r) => allRows.push(r));
    }

    const validated = allRows.map((r, i) => validateRow(r, i));
    const validRows = validated.filter((v) => v.errors.length === 0);
    const invalidRows = validated.filter((v) => v.errors.length > 0);

    // Detect conflicts against existing serial numbers per resolved leaf node.
    const pathStrs = [...new Set(validRows.map((v) => v.row.nodePath))];
    const conflicts = [];
    for (const pathStr of pathStrs) {
      const segments = pathStr.split(fmt.PATH_SEPARATOR).map((s) => s.trim()).filter(Boolean);
      // eslint-disable-next-line no-await-in-loop
      let node = null;
      let parentId = null;
      for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        node = await prisma.node.findFirst({ where: { name: segment, parentId, isArchived: false } });
        if (!node) break;
        parentId = node.id;
      }
      if (!node) continue; // node doesn't exist yet — nothing to conflict with
      // eslint-disable-next-line no-await-in-loop
      const existingSerials = await prisma.question.findMany({ where: { nodeId: node.id }, select: { serialNumber: true } });
      const serialSet = new Set(existingSerials.map((q) => q.serialNumber));
      for (const v of validRows) {
        if (v.row.nodePath === pathStr && v.row.serialNumber && serialSet.has(v.row.serialNumber)) {
          conflicts.push({ index: v.index, nodePath: pathStr, serialNumber: v.row.serialNumber });
        }
      }
    }

    res.json({
      totalRows: allRows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      conflictCount: conflicts.length,
      invalidRows: invalidRows.map((v) => ({ index: v.index, errors: v.errors, row: v.row })),
      conflicts,
      rows: validRows.map((v) => v.row),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Import: commit ----------

const commitSchema = z.object({
  rows: z
    .array(
      z.object({
        serialNumber: z.number().int().positive().optional(),
        nodePath: z.string().min(1),
        title: z.string().min(1),
        format: z.enum(['TEXT', 'CODE', 'BOTH']),
        codeLanguage: z.string().nullable().optional(),
        questionText: z.string().optional().default(''),
        questionCode: z.string().optional().default(''),
        answerText: z.string().optional().default(''),
        answerCode: z.string().optional().default(''),
        difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
        tags: z.array(z.string()).optional().default([]),
      })
    )
    .min(1)
    .max(2000),
  conflictResolution: z.enum(['overwrite', 'renumber', 'skip']).default('skip'),
  fileName: z.string().optional().default('import'),
  fileFormat: z.string().optional().default('json'),
});

router.post('/import/commit', requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const data = validate(commitSchema, req.body);
    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    const errors = [];

    await prisma.$transaction(async (tx) => {
      const nodeCache = new Map();

      // Finds (or creates) the full chain of nodes for a "A > B > C" path,
      // returning the leaf node. Intermediate segments become non-leaf
      // parents; only the final segment ever gets a question attached.
      async function getOrCreateNodeChain(pathStr) {
        if (nodeCache.has(pathStr)) return nodeCache.get(pathStr);
        const segments = pathStr.split(fmt.PATH_SEPARATOR).map((s) => s.trim()).filter(Boolean);
        let parentId = null;
        let node = null;
        for (const segment of segments) {
          // eslint-disable-next-line no-await-in-loop
          node = await tx.node.findFirst({ where: { name: segment, parentId, isArchived: false } });
          if (!node) {
            // eslint-disable-next-line no-await-in-loop
            node = await tx.node.create({ data: { name: segment, parentId, createdById: req.user.id } });
          }
          parentId = node.id;
        }
        nodeCache.set(pathStr, node);
        return node;
      }

      for (const row of data.rows) {
        // eslint-disable-next-line no-await-in-loop
        const node = await getOrCreateNodeChain(row.nodePath);

        let serialNumber = row.serialNumber;
        let existing = null;
        if (serialNumber) {
          // eslint-disable-next-line no-await-in-loop
          existing = await tx.question.findUnique({
            where: { nodeId_serialNumber: { nodeId: node.id, serialNumber } },
          });
        }

        const fieldData = {
          title: row.title,
          format: row.format,
          codeLanguage: row.format === 'TEXT' ? null : row.codeLanguage,
          questionText: row.questionText || null,
          questionCode: row.format === 'TEXT' ? null : row.questionCode || null,
          answerText: row.answerText || null,
          answerCode: row.format === 'TEXT' ? null : row.answerCode || null,
          difficulty: row.difficulty,
          tags: JSON.stringify(row.tags || []),
        };

        if (existing) {
          if (data.conflictResolution === 'skip') {
            skipped += 1;
            continue;
          }
          if (data.conflictResolution === 'overwrite') {
            // eslint-disable-next-line no-await-in-loop
            await tx.question.update({ where: { id: existing.id }, data: fieldData });
            overwritten += 1;
            continue;
          }
          if (data.conflictResolution === 'renumber') {
            serialNumber = undefined; // fall through to auto-assign below
          }
        }

        if (!serialNumber) {
          serialNumber = node.nextSerial;
        }
        // eslint-disable-next-line no-await-in-loop
        await tx.node.update({
          where: { id: node.id },
          data: { nextSerial: Math.max(node.nextSerial, serialNumber + 1) },
        });
        node.nextSerial = Math.max(node.nextSerial, serialNumber + 1);

        // eslint-disable-next-line no-await-in-loop
        await tx.question.create({
          data: { nodeId: node.id, serialNumber, createdById: req.user.id, ...fieldData },
        });
        imported += 1;
      }
    });

    const status = errors.length > 0 ? (imported > 0 ? 'partial' : 'failed') : 'success';

    await prisma.importExport.create({
      data: {
        userId: req.user.id,
        action: 'import',
        fileName: data.fileName,
        fileFormat: data.fileFormat,
        recordCount: imported,
        nodesIncluded: JSON.stringify([...new Set(data.rows.map((r) => r.nodePath))]),
        status,
        errorDetails: errors.length ? JSON.stringify(errors) : null,
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.IMPORT,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      details: { imported, skipped, overwritten },
      ipAddress: req.ip,
    });

    res.json({ imported, skipped, overwritten, errors });
  } catch (err) {
    next(err);
  }
});

router.get('/history', requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const history = await prisma.importExport.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
