// server/socket.js
const { Server } = require('socket.io');
const { verifyAccessToken } = require('./services/jwt.service');
const { getAuthenticatedRole } = require('./utils/auth-context');
const {
  emitAdminDashboardUpdate,
} = require('./services/adminDashboard.service');

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
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

function buildSocketCorsAllowList() {
  return Array.from(
    new Set([
      ...parseCsv(process.env.CORS_ORIGINS).map(normalizeOrigin),
      ...parseCsv(process.env.CLIENT_URL).map(normalizeOrigin),
    ])
  );
}

function createSocketCorsOriginValidator(allowedOrigins, allowNoOrigin) {
  const allowList = new Set(allowedOrigins);

  return (origin, callback) => {
    if (!origin) {
      callback(null, allowNoOrigin);
      return;
    }

    callback(null, allowList.has(normalizeOrigin(origin)));
  };
}

function extractSocketAccessToken(socket) {
  const authToken = socket.handshake?.auth?.accessToken;

  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const authorization = socket.handshake?.headers?.authorization || '';
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);

  if (match) {
    return match[1].trim() || null;
  }

  return null;
}

function initSocket(httpServer) {
  const socketCorsAllowList = buildSocketCorsAllowList();
  const socketAllowNoOrigin = parseBoolean(process.env.CORS_ALLOW_NO_ORIGIN, true);

  const io = new Server(httpServer, {
    cors: {
      origin: createSocketCorsOriginValidator(socketCorsAllowList, socketAllowNoOrigin),
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    const accessToken = extractSocketAccessToken(socket);

    if (!accessToken) {
      return next(new Error('Unauthorized'));
    }

    try {
      const payload = verifyAccessToken(accessToken);
      const userId = Number(payload.userId || payload.sub);

      if (!Number.isInteger(userId) || userId <= 0) {
        return next(new Error('Unauthorized'));
      }

      socket.auth = {
        userId,
        role: payload.role || null,
        source: 'jwt',
      };
      socket.userId = userId;
      socket.userRole = payload.role || null;
      return next();
    } catch (_error) {
      return next(new Error('Unauthorized'));
    }
  });

  const adminDashboardIntervalMs = Number(process.env.ADMIN_DASHBOARD_RT_INTERVAL_MS) || 30000;

  const adminDashboardTimer = setInterval(async () => {
    try {
      const adminRoomSize = io.sockets.adapter.rooms.get('broadcast:admin')?.size || 0;
      if (adminRoomSize > 0) {
        await emitAdminDashboardUpdate(io);
      }
    } catch (_error) {
      // Keep socket server alive if dashboard broadcasting fails for one cycle.
    }
  }, adminDashboardIntervalMs);

  if (typeof adminDashboardTimer.unref === 'function') {
    adminDashboardTimer.unref();
  }

  io.on('connection', (socket) => {
    // Adiciona o Socket a uma Sala Especifica do User para Enviar Notificacoes em Tempo Real
    socket.join(`user:${socket.userId}`);
    
    // Adiciona à sala de broadcast geral
    socket.join('broadcast');
    
    // Adiciona à sala de broadcast específica da role (se existir)
    const userRole = socket.userRole || getAuthenticatedRole(socket.auth || socket.request || {});
    if (userRole) {
      socket.join(`broadcast:${userRole}`);

      if (userRole === 'admin') {
        emitAdminDashboardUpdate(io).catch(() => {});
      }
    }
    
    socket.on('disconnect', () => {});
  });

  return io;
}
module.exports = { initSocket };
