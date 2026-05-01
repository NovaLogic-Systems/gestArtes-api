/**
 * @file src/routes/admin.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const validateRequest = require('../middlewares/validate.middleware');
const { requireAuth, requireAdminRole, requireRole } = require('../middlewares/auth.middleware');
const {
    createUserSchema,
    deleteUserSchema,
    resetUserPasswordSchema,
    updateUserRolesSchema,
    updateUserSchema,
} = require('../middlewares/schemas/admin.schema');
const adminController = require('../controllers/admin.controller');
const joinRequestController = require('../controllers/joinRequest.controller');
const notificationController = require('../controllers/notification.controller');
const { createSessionSchema } = require('../middlewares/schemas/session.schema');

const router = express.Router();
const adminAccess = [requireAuth, requireAdminRole];

router.get(
    '/dashboard',
    ...adminAccess,
    adminController.getDashboard
);

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
    '/users/:id',
    ...adminAccess,
    ...updateUserSchema,
    validateRequest,
    adminController.updateUser
);

router.delete(
    '/users/:id',
    ...adminAccess,
    ...deleteUserSchema,
    validateRequest,
    adminController.deleteUser
);

router.patch(
    '/users/:id/roles',
    ...adminAccess,
    ...updateUserRolesSchema,
    validateRequest,
    adminController.updateUserRoles
);

router.get(
    '/validations/pending-approval',
    ...adminAccess,
    adminController.listPendingApproval
);

router.patch(
    '/validations/:id/approve',
    ...adminAccess,
    adminController.approveSession
);

router.patch(
    '/validations/:id/reject',
    ...adminAccess,
    adminController.rejectSession
);

router.get(
    '/validations/post-session',
    ...adminAccess,
    adminController.getPostSessionValidations
);

router.patch(
    '/sessions/:id/finalize-validation',
    ...adminAccess,
    adminController.finalizeSessionValidation
);

router.get(
    '/studio-occupancy',
    ...adminAccess,
    adminController.getStudioOccupancy
);

router.get(
    '/coachingjoin-requests/pending',
    ...adminAccess,
    joinRequestController.getAdminPending
);

router.patch(
    '/coachingjoin-requests/:id/approve',
    ...adminAccess,
    joinRequestController.adminApprove
);

router.patch(
    '/coachingjoin-requests/:id/reject',
    ...adminAccess,
    joinRequestController.adminReject
);

router.patch(
    '/users/:id/reset-password',
    requireAuth,
    requireRole('admin'),
    ...resetUserPasswordSchema,
    validateRequest,
    adminController.resetUserPassword
);

router.post(
    '/sessions',
    ...adminAccess,
    ...createSessionSchema,
    validateRequest,
    adminController.createSession
);

router.post(
    '/notifications/broadcast',
    ...adminAccess,
    notificationController.broadcastNotification
);

module.exports = router;

