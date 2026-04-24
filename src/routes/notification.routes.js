// notification.routes.js
const express = require('express');
const router = express.Router();
const {
  APP_ROLES,
  requireAuth,
  requireInternalToken,
  requireRole,
} = require('../middlewares/auth.middleware');
const notificationController = require('../controllers/notification.controller');
const notificationAccess = [requireAuth, requireRole(APP_ROLES)];

router.post('/', requireInternalToken, notificationController.create); // chamado internamente
router.post('/broadcast', requireInternalToken, notificationController.broadcastNotification); // broadcast geral
router.get('/', ...notificationAccess, notificationController.getAll);
router.get('/:id', ...notificationAccess, notificationController.getById);
router.patch('/:id/read', ...notificationAccess, notificationController.markAsRead);
router.delete('/:id', ...notificationAccess, notificationController.remove);

module.exports = router;
