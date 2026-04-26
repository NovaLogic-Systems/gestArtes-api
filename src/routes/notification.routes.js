// notification.routes.js
const express = require('express');
const router = express.Router();
const {
  APP_PERMISSIONS,
  requireAuth,
  requireInternalToken,
  requirePermission,
} = require('../middlewares/auth.middleware');
const notificationController = require('../controllers/notification.controller');
const notificationAccess = [requireAuth, requirePermission(APP_PERMISSIONS.NOTIFICATIONS_ACCESS)];

router.post('/', requireInternalToken, notificationController.create); // chamado internamente
router.post('/broadcast', requireInternalToken, notificationController.broadcastNotification); // broadcast geral
router.get('/', ...notificationAccess, notificationController.getAll);
router.get('/:id', ...notificationAccess, notificationController.getById);
router.patch('/:id/read', ...notificationAccess, notificationController.markAsRead);
router.delete('/:id', ...notificationAccess, notificationController.remove);

module.exports = router;
