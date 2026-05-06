/**
 * @file src/middlewares/schemas/teacherAbsence.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { body } = require('express-validator');

const createTeacherAbsenceSchema = [
  body('startDate')
    .isISO8601().withMessage('Data de início inválida')
    .toDate(),
  body('endDate')
    .isISO8601().withMessage('Data de fim inválida')
    .toDate()
    .custom((endDate, { req }) => {
      if (req.body.startDate && endDate < req.body.startDate) {
        throw new Error('Data de fim inválida');
      }

      return true;
    }),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Motivo inválido')
    .escape(),
];

module.exports = { createTeacherAbsenceSchema };
