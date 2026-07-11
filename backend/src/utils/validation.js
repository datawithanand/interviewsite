const { z } = require('zod');
const { ROLES, QUESTION_FORMATS, DIFFICULTIES, CODE_LANGUAGES } = require('./enums');

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(32, 'Username must be at most 32 characters.')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, underscores, dots, and hyphens.');

// Exactly one of templateId / customQuestion must be provided.
const securityQuestionSelectionSchema = z
  .object({
    templateId: z.string().min(1).optional(),
    customQuestion: z.string().trim().min(3).max(200).optional(),
    answer: z.string().trim().min(1).max(200),
  })
  .refine((d) => Boolean(d.templateId) !== Boolean(d.customQuestion), {
    message: 'Choose one predefined security question or provide a custom question, not both.',
    path: ['templateId'],
  });

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1), // strength checked separately for a clearer error message
  email: z.string().trim().email().optional().nullable(),
  securityQuestion: securityQuestionSelectionSchema,
});

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
});

const forgotPasswordStartSchema = z.object({
  username: usernameSchema,
});

const forgotPasswordVerifySchema = z.object({
  username: usernameSchema,
  answer: z.string().min(1),
  newPassword: z.string().min(1),
});

const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(1),
});

const roleUpdateSchema = z.object({
  role: z.enum([ROLES.REGULAR_USER, ROLES.CONTENT_MANAGER, ROLES.ADMIN]),
});

// ---------- Security question templates (admin-managed pool) ----------

const securityQuestionTemplateCreateSchema = z.object({
  question: z.string().trim().min(3).max(200),
});

const securityQuestionTemplateUpdateSchema = z.object({
  question: z.string().trim().min(3).max(200).optional(),
  isActive: z.boolean().optional(),
});

// ---------- Hierarchy nodes (Technology / Submodule / Child module / ...) ----------

const nodeCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  parentId: z.string().min(1).optional().nullable(),
});

const nodeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

// ---------- Questions (format-driven Text/Code fields) ----------
// TEXT keeps a separate Question and Answer (used for the reveal-answer
// flow in Practice/Mock Interview). CODE and BOTH intentionally have no
// separate Answer — the single Code box (and, for BOTH, the Text box)
// hold the whole thing; answerText/answerCode are never populated for
// these formats and Practice/Mock Interview skip straight to self-rating.
function hasRequiredFieldsForFormat(data) {
  const qt = (data.questionText || '').trim();
  const qc = (data.questionCode || '').trim();
  const at = (data.answerText || '').trim();

  if (data.format === QUESTION_FORMATS.TEXT) return !!qt && !!at;
  if (data.format === QUESTION_FORMATS.CODE) return !!qc;
  if (data.format === QUESTION_FORMATS.BOTH) return !!qt && !!qc;
  return true;
}

const questionFieldsSchema = {
  title: z.string().trim().min(2).max(300),
  format: z.enum([QUESTION_FORMATS.TEXT, QUESTION_FORMATS.CODE, QUESTION_FORMATS.BOTH]),
  codeLanguage: z.enum(CODE_LANGUAGES).optional().nullable(),
  questionText: z.string().trim().max(20000).optional().nullable(),
  questionCode: z.string().max(20000).optional().nullable(),
  answerText: z.string().trim().max(20000).optional().nullable(),
  answerCode: z.string().max(20000).optional().nullable(),
  difficulty: z.enum([DIFFICULTIES.BEGINNER, DIFFICULTIES.INTERMEDIATE, DIFFICULTIES.ADVANCED]),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
};

const questionCreateSchema = z
  .object({
    nodeId: z.string().min(1),
    serialNumber: z.number().int().positive().optional(), // explicit serial (import/admin use)
    ...questionFieldsSchema,
  })
  .refine(hasRequiredFieldsForFormat, {
    message: 'Provide the required content for the selected format (Question + Answer for TEXT; the single Text/Code box for CODE/BOTH).',
    path: ['format'],
  })
  .refine((data) => data.format === QUESTION_FORMATS.TEXT || !!data.codeLanguage, {
    message: 'codeLanguage is required when format is CODE or BOTH.',
    path: ['codeLanguage'],
  });

const questionUpdateSchema = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  format: z.enum([QUESTION_FORMATS.TEXT, QUESTION_FORMATS.CODE, QUESTION_FORMATS.BOTH]).optional(),
  codeLanguage: z.enum(CODE_LANGUAGES).optional().nullable(),
  questionText: z.string().trim().max(20000).optional().nullable(),
  questionCode: z.string().max(20000).optional().nullable(),
  answerText: z.string().trim().max(20000).optional().nullable(),
  answerCode: z.string().max(20000).optional().nullable(),
  difficulty: z.enum([DIFFICULTIES.BEGINNER, DIFFICULTIES.INTERMEDIATE, DIFFICULTIES.ADVANCED]).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  changeDescription: z.string().trim().max(500).optional(),
});

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return result.data;
}

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  forgotPasswordStartSchema,
  forgotPasswordVerifySchema,
  adminResetPasswordSchema,
  roleUpdateSchema,
  securityQuestionTemplateCreateSchema,
  securityQuestionTemplateUpdateSchema,
  nodeCreateSchema,
  nodeUpdateSchema,
  questionCreateSchema,
  questionUpdateSchema,
  hasRequiredFieldsForFormat,
  usernameSchema,
};
