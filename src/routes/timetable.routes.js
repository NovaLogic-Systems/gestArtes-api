const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const upload = multer({ storage: multer.memoryStorage() });
const timetableController = require('../controllers/timetable.controller');

router.get('/timetables', requireAuth, timetableController.listTimetables);
router.get('/timetables/:id', requireAuth, timetableController.getTimetable);
router.post('/timetables', requireAuth, requireRole(['ADMIN']), timetableController.createTimetable);
router.patch('/timetables/:id', requireAuth, requireRole(['ADMIN']), timetableController.updateTimetable);
router.delete('/timetables/:id', requireAuth, requireRole(['ADMIN']), timetableController.deleteTimetable);

// Slots
router.post('/timetables/:id/slots', requireAuth, requireRole(['ADMIN']), timetableController.createSlot);
router.patch('/timetables/slots/:slotId', requireAuth, requireRole(['ADMIN']), timetableController.updateSlot);
router.delete('/timetables/slots/:slotId', requireAuth, requireRole(['ADMIN']), timetableController.deleteSlot);

// OCR import preview
router.post('/timetables/import/ocr', requireAuth, requireRole(['ADMIN']), upload.array('files'), timetableController.importOcrPreview);
router.post('/timetables/import/confirm', requireAuth, requireRole(['ADMIN']), timetableController.importConfirm);

module.exports = router;
