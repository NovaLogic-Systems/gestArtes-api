const express = require('express');
const validateRequest = require('../middlewares/validate.middleware');
const { requireSessionAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const { resetUserPasswordSchema } = require('../middlewares/schemas/admin.schema');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

router.patch(
    '/users/:id/reset-password',
    requireSessionAuth,
    requireAdminRole,
    ...resetUserPasswordSchema,
    validateRequest,
    adminController.resetUserPassword
);

module.exports = router;