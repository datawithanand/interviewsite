const ROLES = Object.freeze({
  REGULAR_USER: 'REGULAR_USER',
  WRITER: 'WRITER',
  ADMIN: 'ADMIN',
});

const QUESTION_FORMATS = Object.freeze({
  TEXT: 'TEXT',
  CODE: 'CODE',
  BOTH: 'BOTH',
});

const DIFFICULTIES = Object.freeze({
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
});

const CODE_LANGUAGES = Object.freeze([
  'javascript',
  'python',
  'java',
  'sql',
  'json',
  'xml',
  'yaml',
  'bash',
  'typescript',
  'csharp',
]);

const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CREATE: 'CREATE',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT',
  ROLE_CHANGE: 'ROLE_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
});

const AUDIT_TARGET_TYPES = Object.freeze({
  USER: 'USER',
  QUESTION: 'QUESTION',
  MODULE: 'MODULE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  SESSION: 'SESSION',
});

module.exports = {
  ROLES,
  QUESTION_FORMATS,
  DIFFICULTIES,
  CODE_LANGUAGES,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
};
