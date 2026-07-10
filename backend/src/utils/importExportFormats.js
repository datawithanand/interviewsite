const { parse: csvParseSync } = require('csv-parse/sync');
const { stringify: csvStringifySync } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');
const { create } = require('xmlbuilder2');
const { xml2js } = require('xml-js');
const PDFDocument = require('pdfkit');

const PATH_SEPARATOR = ' > ';

const FIELD_ORDER = [
  'serialNumber',
  'nodePath',
  'title',
  'format',
  'codeLanguage',
  'questionText',
  'questionCode',
  'answerText',
  'answerCode',
  'difficulty',
  'tags',
];

// Prevents CSV/formula injection: a cell beginning with =, +, -, @ (or tab/CR)
// is interpreted as a formula by Excel/Sheets when the export is reopened.
// Prefixing with a single quote neutralizes it while keeping the value readable.
function sanitizeForSpreadsheet(row) {
  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
      sanitized[key] = `'${value}`;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function questionToRow(q, nodePath) {
  return {
    serialNumber: q.serialNumber,
    nodePath,
    title: q.title,
    format: q.format,
    codeLanguage: q.codeLanguage || '',
    questionText: q.questionText || '',
    questionCode: q.questionCode || '',
    answerText: q.answerText || '',
    answerCode: q.answerCode || '',
    difficulty: q.difficulty,
    tags: JSON.parse(q.tags || '[]').join('|'),
  };
}

// ---------- JSON ----------

function toJson(questionsByPath) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      nodes: Object.entries(questionsByPath).map(([nodePath, questions]) => ({
        nodePath,
        questions: questions.map((q) => questionToRow(q, nodePath)),
      })),
    },
    null,
    2
  );
}

function fromJson(buffer) {
  const parsed = JSON.parse(buffer.toString('utf-8'));
  const rows = [];
  const entries = parsed.nodes || parsed.modules || parsed; // `modules` kept for backward-compat with older exports
  for (const entry of entries) {
    const nodePath = entry.nodePath || entry.module;
    for (const q of entry.questions || []) {
      rows.push({ ...q, nodePath });
    }
  }
  return rows;
}

// ---------- CSV ----------

function toCsv(questionsByPath) {
  const rows = [];
  for (const [nodePath, questions] of Object.entries(questionsByPath)) {
    for (const q of questions) rows.push(sanitizeForSpreadsheet(questionToRow(q, nodePath)));
  }
  return csvStringifySync(rows, { header: true, columns: FIELD_ORDER });
}

function fromCsv(buffer) {
  return csvParseSync(buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
}

// ---------- Excel (.xlsx) — single sheet, nodePath as a column ----------
// (Sharding into one sheet per node isn't practical once paths are
// unlimited-depth: sheet names are capped at 31 chars and there's no bound
// on how many distinct paths an export might touch.)

async function toXlsx(questionsByPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.columns = FIELD_ORDER.map((key) => ({ header: key, key, width: 24 }));
  sheet.getRow(1).font = { bold: true };
  for (const [nodePath, questions] of Object.entries(questionsByPath)) {
    questions.forEach((q) => sheet.addRow(sanitizeForSpreadsheet(questionToRow(q, nodePath))));
  }
  return workbook.xlsx.writeBuffer();
}

function cellToString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (value.result !== undefined) return String(value.result); // formula cell
    if (value.text !== undefined) return String(value.text); // rich text
    if (value.richText) return value.richText.map((r) => r.text).join('');
  }
  return String(value);
}

async function fromXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const rows = [];
  workbook.eachSheet((sheet) => {
    const headerRow = sheet.getRow(1).values; // 1-indexed, index 0 is empty
    const headers = headerRow.slice(1).map((h) => cellToString(h).trim());
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values.slice(1);
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cellToString(values[idx]);
      });
      rows.push(obj);
    });
  });
  return rows;
}

// ---------- XML ----------

function toXml(questionsByPath) {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('questions');
  for (const [nodePath, questions] of Object.entries(questionsByPath)) {
    for (const q of questions) {
      const row = questionToRow(q, nodePath);
      const el = root.ele('question');
      for (const key of FIELD_ORDER) el.ele(key).txt(String(row[key] ?? '')).up();
      el.up();
    }
  }
  return root.end({ prettyPrint: true });
}

function fromXml(buffer) {
  const parsed = xml2js(buffer.toString('utf-8'), { compact: true });
  const questionNodes = parsed.questions?.question;
  const list = Array.isArray(questionNodes) ? questionNodes : questionNodes ? [questionNodes] : [];
  return list.map((node) => {
    const row = {};
    for (const key of FIELD_ORDER) {
      row[key] = node[key]?._text ?? '';
    }
    return row;
  });
}

// ---------- Markdown (export only) ----------

function toMarkdown(questionsByPath) {
  const lines = ['# Question Export', ''];
  for (const [nodePath, questions] of Object.entries(questionsByPath)) {
    lines.push(`## ${nodePath}`, '');
    for (const q of questions) {
      lines.push(`### #${q.serialNumber} ${q.title} _(${q.difficulty})_`, '');
      if (q.questionText) lines.push(q.questionText, '');
      if (q.questionCode) lines.push('```' + (q.codeLanguage || ''), q.questionCode, '```', '');
      lines.push('**Answer:**', '');
      if (q.answerText) lines.push(q.answerText, '');
      if (q.answerCode) lines.push('```' + (q.codeLanguage || ''), q.answerCode, '```', '');
      if (q.tags) {
        const tags = JSON.parse(q.tags || '[]');
        if (tags.length) lines.push(`Tags: ${tags.map((t) => `\`${t}\``).join(', ')}`, '');
      }
      lines.push('---', '');
    }
  }
  return lines.join('\n');
}

// ---------- PDF (export only) ----------

function toPdf(questionsByPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Question Export', { align: 'center' });
    doc.moveDown();

    for (const [nodePath, questions] of Object.entries(questionsByPath)) {
      doc.addPage().fontSize(16).text(nodePath, { underline: true });
      doc.moveDown(0.5);
      for (const q of questions) {
        doc.fontSize(12).font('Helvetica-Bold').text(`#${q.serialNumber} — ${q.title} [${q.difficulty}]`);
        doc.font('Helvetica').fontSize(10);
        if (q.questionText) doc.text(q.questionText);
        if (q.questionCode) {
          doc.fontSize(9).fillColor('gray').text(`Question code (${q.codeLanguage || 'code'}):`).fillColor('black');
          doc.fontSize(9).text(q.questionCode);
        }
        doc.fontSize(10).text('Answer:');
        if (q.answerText) doc.text(q.answerText);
        if (q.answerCode) {
          doc.fontSize(9).fillColor('gray').text(`Answer code (${q.codeLanguage || 'code'}):`).fillColor('black');
          doc.fontSize(9).text(q.answerCode);
        }
        doc.moveDown(0.75);
      }
    }
    doc.end();
  });
}

function normalizeRow(row) {
  return {
    serialNumber: row.serialNumber ? Number(row.serialNumber) : undefined,
    nodePath: String(row.nodePath || row.module || '').trim(),
    title: String(row.title || '').trim(),
    format: String(row.format || 'TEXT').trim().toUpperCase(),
    codeLanguage: row.codeLanguage ? String(row.codeLanguage).trim().toLowerCase() : null,
    questionText: row.questionText ? String(row.questionText).trim() : row.content ? String(row.content).trim() : '',
    questionCode: row.questionCode ? String(row.questionCode) : '',
    answerText: row.answerText ? String(row.answerText).trim() : row.answer ? String(row.answer).trim() : '',
    answerCode: row.answerCode ? String(row.answerCode) : '',
    difficulty: String(row.difficulty || 'BEGINNER').trim().toUpperCase(),
    tags: row.tags
      ? String(row.tags)
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  };
}

module.exports = {
  PATH_SEPARATOR,
  toJson,
  fromJson,
  toCsv,
  fromCsv,
  toXlsx,
  fromXlsx,
  toXml,
  fromXml,
  toMarkdown,
  toPdf,
  normalizeRow,
};
