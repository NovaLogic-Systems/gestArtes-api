/**
 * @file src/routes/coaching.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const { createTeacherSessionSchema } = require('../middlewares/schemas/coaching.schema');
const { bookingSchema } = require('../middlewares/schemas/booking.schema');
const coachingController = require('../controllers/coaching.controller');
const groupController = require('../controllers/groupCoachingProposal.controller');

const router = express.Router();

// Available to any authenticated user for the grid/slot picker
router.get('/coaching/slots', requireAuth, coachingController.getAvailableSlots);
router.get('/coaching/modalities', requireAuth, coachingController.listModalities);
router.get('/coaching/teachers', requireAuth, coachingController.listTeachersByModality);
router.get('/coaching/teacher-availability', requireAuth, coachingController.getTeacherWeeklyAvailability);

// BR-17 (2.3): Coaching map view — occupancy and unavailability data for visual coaching grid
router.get('/coaching/weekly-map', requireAuth, coachingController.getWeeklyMap);

// BR-05: list studios compatible with a given modality
router.get('/studios/compatible', requireAuth, coachingController.getCompatibleStudios);

// BR-11/BR-12: teacher-initiated coaching sessions start in pending approval.
router.post(
  '/coaching/sessions',
  requireAuth,
  requireRole(['TEACHER']),
  ...createTeacherSessionSchema,
  validateRequest,
  coachingController.createSession
);

// Student session history (past + future)
router.get(
  '/coaching/sessions/history',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.getSessionHistory
);

// BR-11: create a booking (student or teacher)
router.post(
  '/coaching/bookings',
  requireAuth,
  requireRole(['STUDENT', 'TEACHER']),
  ...bookingSchema,
  validateRequest,
  coachingController.createBooking
);

router.post(
  '/coaching/requests',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.createRequest
);

router.get(
  '/coaching/requests/my',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.listMyRequests
);

router.get(
  '/coaching/requests/teacher',
  requireAuth,
  requireRole(['TEACHER']),
  coachingController.listTeacherRequests
);

router.get(
  '/coaching/requests/admin',
  requireAuth,
  requireRole(['ADMIN']),
  coachingController.listAdminRequests
);

router.get(
  '/coaching/requests/:id',
  requireAuth,
  requireRole(['STUDENT', 'TEACHER', 'ADMIN']),
  coachingController.getRequestById
);

router.patch(
  '/coaching/requests/:id/teacher-review',
  requireAuth,
  requireRole(['TEACHER']),
  coachingController.reviewRequestAsTeacher
);

router.patch(
  '/coaching/requests/:id/student-review',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.respondToTeacherSuggestion
);

router.patch(
  '/coaching/requests/:id/admin-review',
  requireAuth,
  requireRole(['ADMIN']),
  coachingController.reviewRequestAsAdmin
);

router.get(
  '/coaching/requests/:id/compatible-studios',
  requireAuth,
  requireRole(['ADMIN']),
  coachingController.getCompatibleStudiosForRequest
);

// BR-17: cancel a booking — justification required
router.patch(
  '/coaching/bookings/:id',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.cancelBooking
);

// BR-14 step 1: student confirms the session took place
router.patch(
  '/coaching/sessions/:id/confirm-completion',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.confirmCompletion
);

router.patch(
  '/sessions/:id/validate',
  requireAuth,
  requireRole(['STUDENT']),
  coachingController.confirmCompletion
);

// --- Group coaching proposals ---
router.get(
  '/coaching/students/search',
  requireAuth,
  requireRole(['TEACHER']),
  groupController.searchStudents
);

router.post(
  '/coaching/group-proposals',
  requireAuth,
  requireRole(['TEACHER']),
  groupController.createProposal
);

router.get(
  '/coaching/group-proposals/teacher',
  requireAuth,
  requireRole(['TEACHER']),
  groupController.listTeacherProposals
);

router.get(
  '/coaching/group-proposals/admin',
  requireAuth,
  requireRole(['ADMIN']),
  groupController.listAdminProposals
);

router.get(
  '/coaching/group-proposals/:id/compatible-studios',
  requireAuth,
  requireRole(['ADMIN']),
  groupController.getCompatibleStudios
);

router.patch(
  '/coaching/group-proposals/:id/admin-review',
  requireAuth,
  requireRole(['ADMIN']),
  groupController.reviewProposal
);

module.exports = router;
