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

function initSocket(httpServer, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: {
      origin: normalizeOrigin(process.env.CLIENT_URL),
      credentials: true,
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

  setInterval(async () => {
    try {
      const adminRoomSize = io.sockets.adapter.rooms.get('broadcast:admin')?.size || 0;
      if (adminRoomSize > 0) {
        await emitAdminDashboardUpdate(io);
      }
    } catch (_error) {
      // Keep socket server alive if dashboard broadcasting fails for one cycle.
    }
  }, adminDashboardIntervalMs);

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
