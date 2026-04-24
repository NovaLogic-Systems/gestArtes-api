const express = require('express');
const router = express.Router();
const { loginSchema } = require('../middlewares/schemas/auth.schema');
const validateRequest = require('../middlewares/validate.middleware');
const authController = require('../controllers/auth.controller');
const { loginLimiter } = require('../middlewares/rateLimit.middleware');
const { APP_ROLES, requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.post('/login', loginLimiter, ...loginSchema, validateRequest, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, requireRole(APP_ROLES), authController.me);

module.exports = router;
