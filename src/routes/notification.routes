// notification.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const notificationController = require('../controllers/notification.controller');

router.get('/', requireAuth, notificationController.getAll);
router.get('/:id', requireAuth, notificationController.getById);
router.patch('/:id/read', requireAuth, notificationController.markAsRead);
router.delete('/:id', requireAuth, notificationController.remove);
router.post('/', notificationController.create); // chamado internamente — sem requireAuth

module.exports = router;
