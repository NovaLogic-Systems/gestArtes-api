require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const session = require('express-session');
const MSSQLStore = require('connect-mssql-v2');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const adminRoutes = require('./routes/admin.routes');
const adminMarketplaceRoutes = require('./routes/admin.marketplace.routes');
const adminInventoryRoutes = require('./routes/admin.inventory.routes');
const adminStudiosRoutes = require('./routes/admin.studios.routes');
const adminStudioOccupancyRoutes = require('./routes/admin.studio-occupancy.routes');
const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const teacherRoutes = require('./routes/teacher.routes');
const lostFoundRoutes = require('./routes/lostFound.routes');
const marketplaceRoutes = require('./routes/marketplace.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const notificationRoutes = require('./routes/notification.routes');
const financeRoutes = require('./routes/finance.routes');
const auditRoutes = require('./routes/audit.routes');
const joinRequestRoutes = require('./routes/joinRequest.routes');
const coachingRoutes = require('./routes/coaching.routes');
const apiRateLimiter = require('./middlewares/rateLimit.middleware');
const errorHandler = require('./middlewares/error.middleware');
const { setupSwagger } = require('./config/swagger');
const logger = require('./utils/logger');
const { initSocket } = require('./socket');

const app = express();

const SESSION_COOKIE_NAME = 'connect.sid';
const SESSION_TTL_MS = parsePositiveInt(
  process.env.SESSION_TTL_MS,
  1000 * 60 * 60 * 2
);
const SESSION_TABLE_NAME = 'Sessions';
const SESSION_AUTO_REMOVE_INTERVAL_MS = 1000 * 60 * 10;
const SESSION_STORE_RETRIES = 1;
const SESSION_STORE_RETRY_DELAY_MS = 1000;
const CSP_NONCE_BYTE_LENGTH = 16;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CORS_ALLOW_NO_ORIGIN = parseBoolean(
  process.env.CORS_ALLOW_NO_ORIGIN,
  true
);
const CORS_ORIGINS = buildCorsAllowList();
const SESSION_CROSS_SITE = parseBoolean(
  process.env.SESSION_COOKIE_CROSS_SITE,
  false
);
const SESSION_COOKIE_SAMESITE = SESSION_CROSS_SITE ? 'none' : 'strict';
const SESSION_COOKIE_SECURE = resolveSecureCookieSetting(
  process.env.SESSION_COOKIE_SECURE,
  SESSION_CROSS_SITE ? true : (IS_PRODUCTION ? true : 'auto')
);
const HAS_SESSION_SECRET = Boolean(process.env.SESSION_SECRET);
const SESSION_SECRET = HAS_SESSION_SECRET
  ? process.env.SESSION_SECRET
  : crypto.randomBytes(32).toString('hex');

if (IS_PRODUCTION && !HAS_SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production');
}

if (!HAS_SESSION_SECRET) {
  logger.warn('SESSION_SECRET not set; using an ephemeral development secret');
}

if (IS_PRODUCTION && CORS_ORIGINS.length === 0) {
  throw new Error(
    'At least one CORS origin is required in production (CORS_ORIGINS or CLIENT_URL)'
  );
}

if (!IS_PRODUCTION && CORS_ORIGINS.length === 0) {
  logger.warn('No CORS origins configured; allowing all origins in non-production');
}

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

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function resolveSecureCookieSetting(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === 'auto') {
    return 'auto';
  }

  return parseBoolean(value, fallback);
}

function parseCsv(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function buildCorsAllowList() {
  return Array.from(
    new Set([
      ...parseCsv(process.env.CORS_ORIGINS).map(normalizeOrigin),
      ...parseCsv(process.env.CLIENT_URL).map(normalizeOrigin),
    ])
  );
}

function createCorsOriginValidator(allowedOrigins) {
  const allowList = new Set(allowedOrigins);

  return (origin, callback) => {
    if (!origin) {
      return callback(null, CORS_ALLOW_NO_ORIGIN);
    }

    if (allowList.size === 0 || allowList.has(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  };
}

function buildCspNonceSource(req, res) {
  return `'nonce-${res.locals.cspNonce}'`;
}

function attachCspNonce(req, res, next) {
  res.locals.cspNonce = crypto
    .randomBytes(CSP_NONCE_BYTE_LENGTH)
    .toString('hex');
  next();
}

const apiCspMiddleware = helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", 'data:'],
    formAction: ["'self'"],
    upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
  },
});

const docsCspMiddleware = helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'", buildCspNonceSource],
    styleSrc: ["'self'", buildCspNonceSource],
    styleSrcAttr: ["'none'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", 'data:'],
    formAction: ["'self'"],
    upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
  },
});

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

app.use(
  cors({
    origin: createCorsOriginValidator(CORS_ORIGINS),
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);
app.use(attachCspNonce);
app.use((req, res, next) => {
  if (req.path.startsWith('/docs')) {
    return docsCspMiddleware(req, res, next);
  }

  return apiCspMiddleware(req, res, next);
});
app.use(express.json());
const uploadsStaticPath = path.resolve(__dirname, '..', 'uploads');
const uploadsStaticOptions = {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
};
app.use('/uploads', express.static(uploadsStaticPath, uploadsStaticOptions));
app.use('/api/uploads', express.static(uploadsStaticPath, uploadsStaticOptions));
app.use(morgan('dev'));
if (parseBoolean(process.env.TRUST_PROXY, false)) {
  app.set('trust proxy', 1);
}
app.set('sessionCookieName', SESSION_COOKIE_NAME);
app.set('sessionCookieOptions', {
  httpOnly: true,
  secure: SESSION_COOKIE_SECURE,
  sameSite: SESSION_COOKIE_SAMESITE,
  maxAge: SESSION_TTL_MS,
});
const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: app.get('sessionCookieOptions'),
});

app.use(sessionMiddleware);
app.use(apiRateLimiter);

// Routes
app.use('/auth', authRoutes);
app.use('/student', studentRoutes);
app.use('/teacher', teacherRoutes);
app.use('/', lostFoundRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/teacher/inventory', inventoryRoutes);
app.use('/notifications', notificationRoutes);
app.use('/', joinRequestRoutes);
app.use('/', coachingRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/', financeRoutes);
app.use('/', auditRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/marketplace', adminMarketplaceRoutes);
app.use('/admin/inventory', adminInventoryRoutes);
app.use('/admin/studios', adminStudiosRoutes);
app.use('/admin/studio-occupancy', adminStudioOccupancyRoutes);
setupSwagger(app);

app.use((err, req, res, next) => {
  errorHandler(err, req, res, next);
});

const httpServer = http.createServer(app);

const io = initSocket(httpServer, sessionMiddleware);
app.set('io', io);

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  httpServer.listen(port, () => {
    logger.info(`API running on http://localhost:${port}`);
  });
}

module.exports = app;
