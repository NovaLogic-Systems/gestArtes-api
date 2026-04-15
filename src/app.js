require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MSSQLStore = require('connect-mssql-v2');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const apiRateLimiter = require('./middlewares/rateLimit.middleware');
const errorHandler = require('./middlewares/error.middleware');
const { setupSwagger } = require('./config/swagger');
const logger = require('./utils/logger');

const app = express();

const SESSION_COOKIE_NAME = 'connect.sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_TABLE_NAME = 'Sessions';
const SESSION_AUTO_REMOVE_INTERVAL_MS = 1000 * 60 * 10;
const SESSION_STORE_RETRIES = 1;
const SESSION_STORE_RETRY_DELAY_MS = 1000;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function sanitizeConnectionString(value) {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function safeDecode(value) {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return String(value);
  }
}

function buildMssqlSessionConfig() {
  const rawConnectionString = sanitizeConnectionString(
    process.env.DATABASE_URL
  );

  if (!rawConnectionString) {
    throw new Error('DATABASE_URL is required for session store');
  }

  if (rawConnectionString.startsWith('sqlserver://') && rawConnectionString.includes(';')) {
    const withoutScheme = rawConnectionString.slice('sqlserver://'.length);
    const parts = withoutScheme.split(';').map((part) => part.trim()).filter(Boolean);

    const server = safeDecode(parts[0] || '');
    const pairs = Object.fromEntries(
      parts
        .slice(1)
        .map((part) => {
          const separatorIndex = part.indexOf('=');

          if (separatorIndex < 0) {
            return null;
          }

          const key = part.slice(0, separatorIndex).trim().toLowerCase();
          const val = part.slice(separatorIndex + 1).trim();
          return [key, val];
        })
        .filter(Boolean)
    );

    const user = safeDecode(pairs.user || pairs.uid || '');
    const password = safeDecode(pairs.password || pairs.pwd || '');
    const database = safeDecode(pairs.database || '');
    const port = Number(pairs.port || '') || undefined;

    if (!server || !user || !database) {
      throw new Error('Invalid SQL Server connection string for session store');
    }

    return {
      user,
      password,
      server,
      database,
      port,
      options: {
        encrypt: parseBoolean(pairs.encrypt, true),
        trustServerCertificate: parseBoolean(pairs.trustservercertificate, false),
      },
    };
  }

  const parsed = new URL(rawConnectionString);
  const database = parsed.pathname.replace(/^\/+/, '');

  return {
    user: safeDecode(parsed.username),
    password: safeDecode(parsed.password),
    server: parsed.hostname,
    database,
    port: Number(parsed.port || '') || undefined,
    options: {
      encrypt: parseBoolean(parsed.searchParams.get('encrypt'), true),
      trustServerCertificate: parseBoolean(
        parsed.searchParams.get('trustServerCertificate'),
        false
      ),
    },
  };
}

const sessionStore = new MSSQLStore(buildMssqlSessionConfig(), {
  table: SESSION_TABLE_NAME,
  ttl: SESSION_TTL_MS,
  autoRemove: true,
  autoRemoveInterval: SESSION_AUTO_REMOVE_INTERVAL_MS,
  useUTC: true,
  retries: SESSION_STORE_RETRIES,
  retryDelay: SESSION_STORE_RETRY_DELAY_MS,
});

sessionStore.on('error', (error) => {
  logger.error(`Session store error: ${error.message}`);
});

sessionStore.on('sessionError', (error, method) => {
  logger.error(`Session store method error (${method}): ${error.message}`);
});

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.set('trust proxy', 1);
app.use(
  session({
    name: SESSION_COOKIE_NAME,
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_TTL_MS,
    },
  })
);
app.use(apiRateLimiter);

// Routes
app.use('/auth', authRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

setupSwagger(app);

app.use((err, req, res, next) => {
  errorHandler(err, req, res, next);
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => {
    logger.info(`API running on http://localhost:${port}`);
  });
}

module.exports = app;
