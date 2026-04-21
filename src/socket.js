// server/socket.js
const { Server } = require('socket.io');
const { bindSessionToSocket } = require('./middlewares/socket.io.handshake');

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

  io.on('connection', (socket) => {
    // Adiciona o Socket a uma Sala Especifica do User para Enviar Notificacoes em Tempo Real
    socket.join(`user:${socket.userId}`);
    
    // Adiciona à sala de broadcast geral
    socket.join('broadcast');
    
    // Adiciona à sala de broadcast específica da role (se existir)
    const userRole = socket.request.session?.role;
    if (userRole) {
      const normalizedRole = String(userRole).trim().toLowerCase();
      socket.join(`broadcast:${normalizedRole}`);
    }
    
    socket.on('disconnect', () => {});
  });

  return io;
}
module.exports = { initSocket };