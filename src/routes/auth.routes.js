const express = require('express');
const router = express.Router();
const { loginSchema } = require('../middleware/schemas/auth.schema');
const { validateRequest } = require('../middleware/validation.middleware');
const authController = require('../controllers/auth.controller');
const { loginLimiter } = require('../middleware/rateLimit.middleware');

router.post('/login', loginLimiter, loginSchema, validateRequest, authController.login);
router.post('/logout', authController.logout);

module.exports = router;
