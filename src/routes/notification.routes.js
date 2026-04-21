// notification.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireInternalToken } = require('../middlewares/auth.middleware');
const notificationController = require('../controllers/notification.controller');

router.get('/', requireAuth, notificationController.getAll);
router.get('/:id', requireAuth, notificationController.getById);
router.patch('/:id/read', requireAuth, notificationController.markAsRead);
router.delete('/:id', requireAuth, notificationController.remove);
router.post('/', requireInternalToken, notificationController.create); // chamado internamente
router.post('/broadcast', requireInternalToken, notificationController.broadcastNotification); // broadcast geral

module.exports = router;
