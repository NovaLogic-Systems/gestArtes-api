const express = require('express');
const validateRequest = require('../middlewares/validate.middleware');
const { requireSessionAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const { resetUserPasswordSchema } = require('../middlewares/schemas/admin.schema');
const adminController = require('../controllers/admin.controller');
const { createSessionSchema } = require('../middlewares/schemas/session.schema');

const router = express.Router();

router.patch(
    '/users/:id/reset-password',
    requireSessionAuth,
    requireAdminRole,
    ...resetUserPasswordSchema,
    validateRequest,
    adminController.resetUserPassword
);

router.post(
    '/sessions',
    requireSessionAuth,
    requireAdminRole,
    ...createSessionSchema,
    validateRequest,
    adminController.createSession
);

module.exports = router;