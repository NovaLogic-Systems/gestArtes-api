// server/socket.js
const { Server } = require('socket.io');
const { bindSessionToSocket } = require('./middlewares/socket.io.handshake');
const { getSessionRole } = require('./middlewares/auth.middleware');
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

function initSocket(httpServer, sessionMiddleware) {
  const socketCorsAllowList = buildSocketCorsAllowList();
  const socketAllowNoOrigin = parseBoolean(process.env.CORS_ALLOW_NO_ORIGIN, true);

  const io = new Server(httpServer, {
    cors: {
      origin: createSocketCorsOriginValidator(socketCorsAllowList, socketAllowNoOrigin),
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use(bindSessionToSocket(sessionMiddleware));

  io.use((socket, next) => {
    // Authentication: Ve se a Cookie da sessao e Valida
    const session = socket.request.session;
    if (!session?.userId) return next(new Error('Unauthorized'));
    socket.userId = session.userId;
    next();
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
    const userRole = getSessionRole(socket.request.session);
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
