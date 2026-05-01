/**
 * @file src/routes/student.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const {
  APP_PERMISSIONS,
  requireAuth,
  requirePermission,
} = require('../middlewares/auth.middleware');
const studentController = require('../controllers/student.controller');

const router = express.Router();
const studentAccess = [requireAuth, requirePermission(APP_PERMISSIONS.STUDENT_PORTAL_ACCESS)];

router.get('/profile', ...studentAccess, studentController.getProfile);
router.get('/dashboard', ...studentAccess, studentController.getDashboard);
router.get('/schedule/upcoming', ...studentAccess, studentController.getUpcomingSchedule);

module.exports = router;

