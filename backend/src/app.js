const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { apiLimiter, authLimiter } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const profileRoutes = require('./routes/profile');
const modulesRoutes = require('./routes/modules');
const questionsRoutes = require('./routes/questions');
const importExportRoutes = require('./routes/importExport');
const auditLogsRoutes = require('./routes/auditLogs');
const statsRoutes = require('./routes/stats');
const settingsRoutes = require('./routes/settings');
const notificationsRoutes = require('./routes/notifications');
const commentsRoutes = require('./routes/comments');
const savedSearchesRoutes = require('./routes/savedSearches');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  app.use('/api/', apiLimiter);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/modules', modulesRoutes);
  app.use('/api/questions', questionsRoutes);
  app.use('/api/import-export', importExportRoutes);
  app.use('/api/audit-logs', auditLogsRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/saved-searches', savedSearchesRoutes);
  // comments routes are mounted at /api since they define their own
  // /questions/:questionId/comments and /comments/:id sub-paths.
  app.use('/api', commentsRoutes);

  // 404 handler
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Central error handler — never leak stack traces to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.message && err.message.includes('Unsupported file type')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large.' });
    }
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
    res.status(statusCode).json({ error: statusCode >= 500 ? 'Internal server error.' : err.message });
  });

  return app;
}

module.exports = createApp;
