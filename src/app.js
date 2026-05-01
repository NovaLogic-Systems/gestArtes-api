/**
 * @file src/app.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
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
const searchRoutes = require('./routes/search.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const notificationRoutes = require('./routes/notification.routes');
const financeRoutes = require('./routes/finance.routes');
const auditRoutes = require('./routes/audit.routes');
const joinRequestRoutes = require('./routes/joinRequest.routes');
const coachingRoutes = require('./routes/coaching.routes');
const apiRateLimiter = require('./middlewares/rateLimit.middleware');
const { createCsrfProtection } = require('./middlewares/csrf.middleware');
const errorHandler = require('./middlewares/error.middleware');
const { setupSwagger } = require('./config/swagger');
const logger = require('./utils/logger');
const { initSocket } = require('./socket');

const app = express();
const DEFAULT_API_PORT = 3001;

const CSP_NONCE_BYTE_LENGTH = 16;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const HSTS_MAX_AGE = Number(process.env.HSTS_MAX_AGE) || 31536000;
const HAS_SSL = Boolean(SSL_KEY_PATH && SSL_CERT_PATH);
const ENABLE_HTTPS = parseBoolean(process.env.ENABLE_HTTPS, HAS_SSL);
const CORS_ALLOW_NO_ORIGIN = parseBoolean(
  process.env.CORS_ALLOW_NO_ORIGIN,
  true
);
const CORS_ORIGINS = buildCorsAllowList();
const CSRF_ALLOW_NO_ORIGIN = parseBoolean(
  process.env.CSRF_ALLOW_NO_ORIGIN,
  false
);
const REFRESH_COOKIE_CROSS_SITE = parseBoolean(
  process.env.REFRESH_COOKIE_CROSS_SITE ?? process.env.SESSION_COOKIE_CROSS_SITE,
  false
);
const REFRESH_COOKIE_SAMESITE = REFRESH_COOKIE_CROSS_SITE ? 'none' : 'lax';
const REFRESH_COOKIE_SECURE = REFRESH_COOKIE_CROSS_SITE ? true : (IS_PRODUCTION || ENABLE_HTTPS);

if (CORS_ORIGINS.length === 0) {
  throw new Error(
    'At least one CORS origin is required (CORS_ORIGINS or CLIENT_URL)'
  );
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

    if (allowList.has(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  };
}

const csrfProtection = createCsrfProtection({
  allowedOrigins: CORS_ORIGINS,
  allowNoOrigin: CSRF_ALLOW_NO_ORIGIN,
});

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
    upgradeInsecureRequests: IS_PRODUCTION && ENABLE_HTTPS ? [] : null,
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
    upgradeInsecureRequests: IS_PRODUCTION && ENABLE_HTTPS ? [] : null,
  },
});

function normalizeFilePath(value) {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

app.disable('x-powered-by');

app.use(
  cors({
    origin: createCorsOriginValidator(CORS_ORIGINS),
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: IS_PRODUCTION && HAS_SSL
      ? { maxAge: HSTS_MAX_AGE, includeSubDomains: true, preload: false }
      : false,
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
app.use(csrfProtection);
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
app.set('refreshCookieName', process.env.REFRESH_TOKEN_COOKIE_NAME || 'gestartes.refresh_token');
app.set('refreshCookieOptions', {
  httpOnly: true,
  secure: REFRESH_COOKIE_SECURE,
  sameSite: REFRESH_COOKIE_SAMESITE,
  path: '/',
});
app.use(apiRateLimiter);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
setupSwagger(app);

// Routes
app.use('/auth', authRoutes);
app.use('/student', studentRoutes);
app.use('/teacher', teacherRoutes);
app.use('/', lostFoundRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/search', searchRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/teacher/inventory', inventoryRoutes);
app.use('/notifications', notificationRoutes);
app.use('/', joinRequestRoutes);
app.use('/', coachingRoutes);
app.use('/', financeRoutes);
app.use('/', auditRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/marketplace', adminMarketplaceRoutes);
app.use('/admin/inventory', adminInventoryRoutes);
app.use('/admin/studios', adminStudiosRoutes);
app.use('/admin/studio-occupancy', adminStudioOccupancyRoutes);

app.use((err, req, res, next) => {
  errorHandler(err, req, res, next);
});

function loadSslCredentials() {
  const keyPath = normalizeFilePath(SSL_KEY_PATH);
  const certPath = normalizeFilePath(SSL_CERT_PATH);

  try {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } catch (err) {
    throw new Error(`Failed to load SSL credentials: ${err.message}`);
  }
}

const httpServer = http.createServer(app);

const io = initSocket(httpServer);
app.set('io', io);

// Carrega jobs agendados se ativado via variáveis de ambiente.
// Por segurança, não habilita os jobs durante testes por omissão.
if (parseBoolean(process.env.ENABLE_JOBS, false)) {
  try {
    require('./jobs/autoCancel');
    logger.info('Background jobs: autoCancel carregado');
  } catch (err) {
    logger.error('Falha ao carregar jobs:', err.message);
  }
}

if (require.main === module) {
  if (ENABLE_HTTPS) {
    let credentials;
    try {
      credentials = loadSslCredentials();
    } catch (err) {
      logger.error(err.message);
      process.exit(1);
    }

    const httpsServer = https.createServer(credentials, app);
    const httpsIo = initSocket(httpsServer);
    app.set('io', httpsIo);

    const httpsPort = Number(process.env.PORT) || DEFAULT_API_PORT;
    httpsServer.listen(httpsPort, () => {
      logger.info(`API running on https://localhost:${httpsPort}`);
    });

    if (IS_PRODUCTION) {
      const httpRedirectPort = Number(process.env.HTTP_PORT) || 80;
      http.createServer((req, res) => {
        const host = (req.headers.host || '').replace(/:\d+$/, '');
        const target = httpsPort === 443 ? host : `${host}:${httpsPort}`;
        res.writeHead(301, { Location: `https://${target}${req.url}` });
        res.end();
      }).listen(httpRedirectPort, () => {
        logger.info(`HTTP→HTTPS redirect on port ${httpRedirectPort}`);
      });
    }
  } else {
    if (IS_PRODUCTION && HAS_SSL) {
      logger.warn('HTTPS disabled via ENABLE_HTTPS=false; running on HTTP');
    } else if (IS_PRODUCTION) {
      logger.warn('SSL not configured; running without HTTPS in production');
    }
    const port = Number(process.env.PORT) || DEFAULT_API_PORT;
    httpServer.listen(port, () => {
      logger.info(`API running on http://localhost:${port}`);
    });
  }
}

module.exports = app;
