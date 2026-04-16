const express = require('express');


const router = express.Router();

router.post('/login', loginLimiter, ...loginSchema, validateRequest, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
