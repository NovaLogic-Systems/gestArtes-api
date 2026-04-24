const express = require('express');
const validateRequest = require('../middlewares/validate.middleware');
const { requireSessionAuth, requireRole } = require('../middlewares/auth.middleware');
const {
    createUserSchema,
    resetUserPasswordSchema,
} = require('../middlewares/schemas/admin.schema');
const adminController = require('../controllers/admin.controller');

const router = express.Router();
const adminAccess = [requireSessionAuth, requireRole(['ADMIN'])];

router.get(
    '/users',
    ...adminAccess,
    adminController.listUsers
);

router.post(
    '/users',
    ...adminAccess,
    ...createUserSchema,
    validateRequest,
    adminController.createUser
);

router.patch(
    '/users/:id/reset-password',
    ...adminAccess,
    ...resetUserPasswordSchema,
    validateRequest,
    adminController.resetUserPassword
);

module.exports = router;
