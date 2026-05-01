/**
 * @file src/routes/joinRequest.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');

const joinRequestController = require('../controllers/joinRequest.controller');
const {
  APP_PERMISSIONS,
  requireAuth,
  requirePermission,
} = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/coaching/sessions/:id/join-requests',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_CREATE),
  joinRequestController.createJoinRequest
);

router.get(
  '/coaching/sessions/:id/join-requests',
  requirePermission(
    APP_PERMISSIONS.JOIN_REQUEST_REVIEW_TEACHER,
    APP_PERMISSIONS.JOIN_REQUEST_REVIEW_ADMIN
  ),
  joinRequestController.listBySession
);

router.get(
  '/coaching/join-requests/teacher-pending',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_REVIEW_TEACHER),
  joinRequestController.getTeacherPending
);

router.patch(
  '/coaching/join-requests/:id/teacher-approve',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_REVIEW_TEACHER),
  joinRequestController.teacherApprove
);

router.patch(
  '/coaching/join-requests/:id/teacher-reject',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_REVIEW_TEACHER),
  joinRequestController.teacherReject
);

router.get(
  '/admin/coaching/join-requests/pending',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_REVIEW_ADMIN),
  joinRequestController.getAdminPending
);

router.patch(
  '/admin/coaching/join-requests/:id/approve',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_REVIEW_ADMIN),
  joinRequestController.adminApprove
);

router.patch(
  '/admin/coaching/join-requests/:id/reject',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_REVIEW_ADMIN),
  joinRequestController.adminReject
);

router.get(
  '/coaching/join-requests/my',
  requirePermission(APP_PERMISSIONS.JOIN_REQUEST_CREATE),
  joinRequestController.getStudentRequests
);

module.exports = router;

