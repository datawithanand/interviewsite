const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireWriterOrAdmin } = require('../middleware/rbac');
const { validate } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, QUESTION_FORMATS, DIFFICULTIES } = require('../utils/enums');
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

router.use(authenticate, requireWriterOrAdmin);

// ---------- Export ----------

const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx', 'xml', 'pdf']),
  moduleIds: z.string().optional(), // comma-separated module ids; omit for all modules
});

router.get('/export', async (req, res, next) => {
  try {
    const q = validate(exportQuerySchema, req.query);
    const moduleIds = q.moduleIds ? q.moduleIds.split(',').filter(Boolean) : undefined;

    const modules = await prisma.module.findMany({
      where: { isArchived: false, ...(moduleIds ? { id: { in: moduleIds } } : {}) },
      include: { questions: { orderBy: { serialNumber: 'asc' } } },
    });

    const questionsByModule = {};
    let recordCount = 0;
    for (const m of modules) {
      questionsByModule[m.name] = m.questions;
      recordCount += m.questions.length;
    }

    let buffer;
    let contentType;
    let filename;

    switch (q.format) {
      case 'json':
        buffer = fmt.toJson(questionsByModule);
        contentType = 'application/json';
        filename = 'questions-export.json';
        break;
      case 'csv':
        buffer = fmt.toCsv(questionsByModule);
        contentType = 'text/csv';
        filename = 'questions-export.csv';
        break;
      case 'xlsx':
        buffer = await fmt.toXlsx(questionsByModule);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'questions-export.xlsx';
        break;
      case 'xml':
        buffer = fmt.toXml(questionsByModule);
        contentType = 'application/xml';
        filename = 'questions-export.xml';
        break;
      case 'pdf':
        buffer = await fmt.toPdf(questionsByModule);
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
        recordCount,
        modulesIncluded: JSON.stringify(Object.keys(questionsByModule)),
        status: 'success',
      },
    });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EXPORT,
      targetType: AUDIT_TARGET_TYPES.QUESTION,
      details: { format: q.format, recordCount },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
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
  if (!row.module) errors.push('module is required');
  if (!row.title) errors.push('title is required');
  if (!row.content) errors.push('content is required');
  if (!row.answer) errors.push('answer is required');
  if (!Object.values(QUESTION_FORMATS).includes(row.format)) errors.push(`invalid format "${row.format}"`);
  if (!Object.values(DIFFICULTIES).includes(row.difficulty)) errors.push(`invalid difficulty "${row.difficulty}"`);
  if ((row.format === 'CODE' || row.format === 'BOTH') && !row.codeLanguage) {
    errors.push('codeLanguage is required for CODE/BOTH format');
  }
  return { row, index, errors };
}

router.post('/import/preview', upload.array('files', 5), async (req, res, next) => {
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

    // Detect conflicts against existing serial numbers per module.
    const moduleNames = [...new Set(validRows.map((v) => v.row.module))];
    const existingModules = await prisma.module.findMany({
      where: { name: { in: moduleNames } },
      include: { questions: { select: { serialNumber: true } } },
    });
    const existingSerialsByModule = new Map(
      existingModules.map((m) => [m.name, new Set(m.questions.map((q) => q.serialNumber))])
    );

    const conflicts = [];
    for (const v of validRows) {
      if (!v.row.serialNumber) continue;
      const set = existingSerialsByModule.get(v.row.module);
      if (set && set.has(v.row.serialNumber)) {
        conflicts.push({ index: v.index, module: v.row.module, serialNumber: v.row.serialNumber });
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
        module: z.string().min(1),
        title: z.string().min(1),
        content: z.string().min(1),
        format: z.enum(['TEXT', 'CODE', 'BOTH']),
        codeLanguage: z.string().nullable().optional(),
        answer: z.string().min(1),
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

router.post('/import/commit', async (req, res, next) => {
  try {
    const data = validate(commitSchema, req.body);
    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    const errors = [];

    await prisma.$transaction(async (tx) => {
      const moduleCache = new Map();

      async function getOrCreateModule(name) {
        if (moduleCache.has(name)) return moduleCache.get(name);
        let mod = await tx.module.findUnique({ where: { name } });
        if (!mod) {
          mod = await tx.module.create({ data: { name, createdById: req.user.id } });
        }
        moduleCache.set(name, mod);
        return mod;
      }

      for (const row of data.rows) {
        // eslint-disable-next-line no-await-in-loop
        const mod = await getOrCreateModule(row.module);

        let serialNumber = row.serialNumber;
        let existing = null;
        if (serialNumber) {
          // eslint-disable-next-line no-await-in-loop
          existing = await tx.question.findUnique({
            where: { moduleId_serialNumber: { moduleId: mod.id, serialNumber } },
          });
        }

        if (existing) {
          if (data.conflictResolution === 'skip') {
            skipped += 1;
            continue;
          }
          if (data.conflictResolution === 'overwrite') {
            // eslint-disable-next-line no-await-in-loop
            await tx.question.update({
              where: { id: existing.id },
              data: {
                title: row.title,
                content: row.content,
                format: row.format,
                codeLanguage: row.format === 'TEXT' ? null : row.codeLanguage,
                answer: row.answer,
                difficulty: row.difficulty,
                tags: JSON.stringify(row.tags || []),
              },
            });
            overwritten += 1;
            continue;
          }
          if (data.conflictResolution === 'renumber') {
            serialNumber = undefined; // fall through to auto-assign below
          }
        }

        if (!serialNumber) {
          serialNumber = mod.nextSerial;
        }
        // eslint-disable-next-line no-await-in-loop
        await tx.module.update({
          where: { id: mod.id },
          data: { nextSerial: Math.max(mod.nextSerial, serialNumber + 1) },
        });
        mod.nextSerial = Math.max(mod.nextSerial, serialNumber + 1);

        // eslint-disable-next-line no-await-in-loop
        await tx.question.create({
          data: {
            moduleId: mod.id,
            serialNumber,
            title: row.title,
            content: row.content,
            format: row.format,
            codeLanguage: row.format === 'TEXT' ? null : row.codeLanguage,
            answer: row.answer,
            difficulty: row.difficulty,
            tags: JSON.stringify(row.tags || []),
            createdById: req.user.id,
          },
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
        modulesIncluded: JSON.stringify([...new Set(data.rows.map((r) => r.module))]),
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

router.get('/history', async (req, res, next) => {
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
