const express = require('express');
const authController = require('../controllers/auth.controller');
const validateRequest = require('../middlewares/validate.middleware');
const { loginSchema } = require('../middlewares/schemas/auth.schema');
const { loginLimiter } = require('../middlewares/rateLimit.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', loginLimiter, ...loginSchema, validateRequest, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
