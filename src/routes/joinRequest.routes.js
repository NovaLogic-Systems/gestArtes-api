const express = require('express');

const joinRequestController = require('../controllers/joinRequest.controller');
const { requireAuth, requireRoles } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/coaching/sessions/:id/join-requests',
  requireRoles('student'),
  joinRequestController.createJoinRequest
);

router.get(
  '/coaching/sessions/:id/join-requests',
  requireRoles(['teacher', 'admin']),
  joinRequestController.listBySession
);

router.get(
  '/coaching/join-requests/teacher-pending',
  requireRoles('teacher'),
  joinRequestController.getTeacherPending
);

router.patch(
  '/coaching/join-requests/:id/teacher-approve',
  requireRoles('teacher'),
  joinRequestController.teacherApprove
);

router.patch(
  '/coaching/join-requests/:id/teacher-reject',
  requireRoles('teacher'),
  joinRequestController.teacherReject
);

router.get(
  '/admin/coaching/join-requests/pending',
  requireRoles('admin'),
  joinRequestController.getAdminPending
);

router.patch(
  '/admin/coaching/join-requests/:id/approve',
  requireRoles('admin'),
  joinRequestController.adminApprove
);

router.patch(
  '/admin/coaching/join-requests/:id/reject',
  requireRoles('admin'),
  joinRequestController.adminReject
);

router.get(
  '/coaching/join-requests/my',
  requireRoles('student'),
  joinRequestController.getStudentRequests
);

module.exports = router;
