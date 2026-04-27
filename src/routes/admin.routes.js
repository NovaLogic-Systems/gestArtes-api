const express = require('express');
const validateRequest = require('../middlewares/validate.middleware');
const { requireSessionAuth, requireAdminRole, requireRole } = require('../middlewares/auth.middleware');
const {
    createUserSchema,
    deleteUserSchema,
    resetUserPasswordSchema,
    updateUserRolesSchema,
    updateUserSchema,
} = require('../middlewares/schemas/admin.schema');
const adminController = require('../controllers/admin.controller');
const joinRequestController = require('../controllers/joinRequest.controller');
const availabilityController = require('../controllers/availability.controller');
const { createSessionSchema } = require('../middlewares/schemas/session.schema');

const router = express.Router();
const adminAccess = [requireSessionAuth, requireAdminRole];

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
    requireSessionAuth,
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

router.get(
    '/availability/pending',
    ...adminAccess,
    availabilityController.listAdminPendingAvailability
);

router.patch(
    '/availability/:availabilityId/approve',
    ...adminAccess,
    availabilityController.approveAvailability
);

router.patch(
    '/availability/:availabilityId/reject',
    ...adminAccess,
    availabilityController.rejectAvailability
);

module.exports = router;
