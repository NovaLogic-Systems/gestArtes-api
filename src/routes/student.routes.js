const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const studentController = require('../controllers/student.controller');

const router = express.Router();

router.get('/profile', requireAuth, studentController.getProfile);

module.exports = router;