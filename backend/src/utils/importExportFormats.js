const { parse: csvParseSync } = require('csv-parse/sync');
const { stringify: csvStringifySync } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');
const { create } = require('xmlbuilder2');
const { xml2js } = require('xml-js');
const PDFDocument = require('pdfkit');

const FIELD_ORDER = [
  'serialNumber',
  'module',
  'title',
  'content',
  'format',
  'codeLanguage',
  'answer',
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

function questionToRow(q, moduleName) {
  return {
    serialNumber: q.serialNumber,
    module: moduleName,
    title: q.title,
    content: q.content,
    format: q.format,
    codeLanguage: q.codeLanguage || '',
    answer: q.answer,
    difficulty: q.difficulty,
    tags: JSON.parse(q.tags || '[]').join('|'),
  };
}

// ---------- JSON ----------

function toJson(questionsByModule) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      modules: Object.entries(questionsByModule).map(([moduleName, questions]) => ({
        module: moduleName,
        questions: questions.map((q) => questionToRow(q, moduleName)),
      })),
    },
    null,
    2
  );
}

function fromJson(buffer) {
  const parsed = JSON.parse(buffer.toString('utf-8'));
  const rows = [];
  const modules = parsed.modules || parsed;
  for (const entry of modules) {
    for (const q of entry.questions || []) {
      rows.push({ ...q, module: entry.module });
    }
  }
  return rows;
}

// ---------- CSV ----------

function toCsv(questionsByModule) {
  const rows = [];
  for (const [moduleName, questions] of Object.entries(questionsByModule)) {
    for (const q of questions) rows.push(sanitizeForSpreadsheet(questionToRow(q, moduleName)));
  }
  return csvStringifySync(rows, { header: true, columns: FIELD_ORDER });
}

function fromCsv(buffer) {
  return csvParseSync(buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
}

// ---------- Excel (.xlsx) — one sheet per module ----------

async function toXlsx(questionsByModule) {
  const workbook = new ExcelJS.Workbook();
  for (const [moduleName, questions] of Object.entries(questionsByModule)) {
    const sheet = workbook.addWorksheet(moduleName.slice(0, 31) || 'Module');
    sheet.columns = FIELD_ORDER.map((key) => ({ header: key, key, width: 24 }));
    sheet.getRow(1).font = { bold: true };
    questions.forEach((q) => sheet.addRow(sanitizeForSpreadsheet(questionToRow(q, moduleName))));
  }
  if (workbook.worksheets.length === 0) workbook.addWorksheet('Empty');
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
      if (!obj.module) obj.module = sheet.name;
      rows.push(obj);
    });
  });
  return rows;
}

// ---------- XML ----------

function toXml(questionsByModule) {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('questions');
  for (const [moduleName, questions] of Object.entries(questionsByModule)) {
    for (const q of questions) {
      const row = questionToRow(q, moduleName);
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

// ---------- PDF (export only) ----------

function toPdf(questionsByModule) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('ServiceNow Interview Questions', { align: 'center' });
    doc.moveDown();

    for (const [moduleName, questions] of Object.entries(questionsByModule)) {
      doc.addPage().fontSize(16).text(moduleName, { underline: true });
      doc.moveDown(0.5);
      for (const q of questions) {
        doc.fontSize(12).font('Helvetica-Bold').text(`#${q.serialNumber} — ${q.title} [${q.difficulty}]`);
        doc.font('Helvetica').fontSize(10).text(q.content || '');
        if (q.codeLanguage) doc.fontSize(9).fillColor('gray').text(`Language: ${q.codeLanguage}`).fillColor('black');
        doc.fontSize(10).text(`Answer: ${q.answer || ''}`);
        doc.moveDown(0.75);
      }
    }
    doc.end();
  });
}

function normalizeRow(row) {
  return {
    serialNumber: row.serialNumber ? Number(row.serialNumber) : undefined,
    module: String(row.module || '').trim(),
    title: String(row.title || '').trim(),
    content: String(row.content || '').trim(),
    format: String(row.format || 'TEXT').trim().toUpperCase(),
    codeLanguage: row.codeLanguage ? String(row.codeLanguage).trim().toLowerCase() : null,
    answer: String(row.answer || '').trim(),
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
  toJson,
  fromJson,
  toCsv,
  fromCsv,
  toXlsx,
  fromXlsx,
  toXml,
  fromXml,
  toPdf,
  normalizeRow,
};
