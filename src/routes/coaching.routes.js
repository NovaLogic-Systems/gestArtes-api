const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const validateRequest = require('../middlewares/validate.middleware');
const { createTeacherSessionSchema } = require('../middlewares/schemas/coaching.schema');
const { bookingSchema } = require('../middlewares/schemas/booking.schema');
const coachingController = require('../controllers/coaching.controller');

const router = express.Router();

// Available to any authenticated user for the grid/slot picker
router.get('/coaching/slots', requireAuth, coachingController.getAvailableSlots);

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

module.exports = router;
