const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const coachingController = require('../controllers/coaching.controller');

const router = express.Router();

// Available to any authenticated user for the grid/slot picker
router.get('/coaching/slots', requireAuth, coachingController.getAvailableSlots);

// BR-05: list studios compatible with a given modality
router.get('/studios/compatible', requireAuth, coachingController.getCompatibleStudios);

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
