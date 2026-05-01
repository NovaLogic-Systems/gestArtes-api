/**
 * @file src/middlewares/schemas/teacherAvailability.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { body } = require('express-validator');

function parseHourMinute(value) {
  const [hours, minutes] = String(value).split(':').map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

const createTeacherAvailabilityPunctualSchema = [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas inválidas')
    .escape(),
  body('startDateTime')
    .isISO8601().withMessage('Data de início inválida')
    .toDate(),
  body('endDateTime')
    .isISO8601().withMessage('Data de fim inválida')
    .toDate()
    .custom((endDateTime, { req }) => {
      if (req.body.startDateTime && endDateTime <= req.body.startDateTime) {
        throw new Error('Data de fim inválida');
      }

      return true;
    }),
];

const createTeacherAvailabilityRecurringSchema = [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas inválidas')
    .escape(),
  body('dayOfWeek')
    .isInt({ min: 0, max: 6 }).withMessage('Dia da semana inválido')
    .toInt(),
  body('startTime')
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Hora de início inválida'),
  body('endTime')
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Hora de fim inválida')
    .custom((endTime, { req }) => {
      if (!req.body.startTime) {
        return true;
      }

      const start = parseHourMinute(req.body.startTime);
      const end = parseHourMinute(endTime);

      if (start === null || end === null) {
        return true;
      }

      if (end <= start) {
        throw new Error('Hora de fim inválida');
      }

      return true;
    }),
  body('academicYearId')
    .isInt({ min: 1 }).withMessage('Ano letivo inválido')
    .toInt(),
  body('isActive')
    .optional()
    .isBoolean().withMessage('Estado ativo inválido')
    .toBoolean(),
];

module.exports = {
  createTeacherAvailabilityPunctualSchema,
  createTeacherAvailabilityRecurringSchema,
};
