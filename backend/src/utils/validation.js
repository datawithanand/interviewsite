const { z } = require('zod');
const { ROLES, QUESTION_FORMATS, DIFFICULTIES, CODE_LANGUAGES } = require('./enums');

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(32, 'Username must be at most 32 characters.')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, underscores, dots, and hyphens.');

const securityQuestionSchema = z.object({
  question: z.string().trim().min(3).max(200),
  answer: z.string().trim().min(1).max(200),
});

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1), // strength checked separately for a clearer error message
  email: z.string().trim().email().optional().nullable(),
  securityQuestions: z.array(securityQuestionSchema).min(3).max(5),
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
  answers: z.array(z.object({ id: z.string().min(1), answer: z.string().min(1) })).min(2),
  newPassword: z.string().min(1),
});

const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(1),
});

const moduleCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().nullable(),
});

const moduleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

const questionCreateSchema = z
  .object({
    moduleId: z.string().min(1),
    title: z.string().trim().min(2).max(300),
    content: z.string().trim().min(1),
    format: z.enum([QUESTION_FORMATS.TEXT, QUESTION_FORMATS.CODE, QUESTION_FORMATS.BOTH]),
    codeLanguage: z.enum(CODE_LANGUAGES).optional().nullable(),
    answer: z.string().trim().min(1),
    difficulty: z.enum([DIFFICULTIES.BEGINNER, DIFFICULTIES.INTERMEDIATE, DIFFICULTIES.ADVANCED]),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
    serialNumber: z.number().int().positive().optional(), // explicit serial (import/admin use)
  })
  .refine((data) => data.format === QUESTION_FORMATS.TEXT || !!data.codeLanguage, {
    message: 'codeLanguage is required when format is CODE or BOTH.',
    path: ['codeLanguage'],
  });

const questionUpdateSchema = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  content: z.string().trim().min(1).optional(),
  format: z.enum([QUESTION_FORMATS.TEXT, QUESTION_FORMATS.CODE, QUESTION_FORMATS.BOTH]).optional(),
  codeLanguage: z.enum(CODE_LANGUAGES).optional().nullable(),
  answer: z.string().trim().min(1).optional(),
  difficulty: z.enum([DIFFICULTIES.BEGINNER, DIFFICULTIES.INTERMEDIATE, DIFFICULTIES.ADVANCED]).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  changeDescription: z.string().trim().max(500).optional(),
});

const roleUpdateSchema = z.object({
  role: z.enum([ROLES.REGULAR_USER, ROLES.WRITER, ROLES.ADMIN]),
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
  moduleCreateSchema,
  moduleUpdateSchema,
  questionCreateSchema,
  questionUpdateSchema,
  roleUpdateSchema,
  usernameSchema,
};
