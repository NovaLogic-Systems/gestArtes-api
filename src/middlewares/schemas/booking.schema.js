/**
 * @file src/middlewares/schemas/booking.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { body } = require('express-validator');

const bookingSchema = [
  body('teacherId')
    .isInt({ min: 1 }).withMessage('Professor inválido')
    .toInt(),
  body('studioId')
    .isInt({ min: 1 }).withMessage('Studio inválido')
    .toInt(),
  body('modalityId')
    .isInt({ min: 1 }).withMessage('Modalidade inválida')
    .toInt(),
  body('startTime')
    .isISO8601().withMessage('Data de início inválida')
    .toDate(),
  body('endTime')
    .isISO8601().withMessage('Data de fim inválida')
    .toDate()
    .custom((value, { req }) => {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new Error('Data de fim inválida');
      }
      const startTime = req.body?.startTime;
      if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) {
        throw new Error('Data de início inválida');
      }
      if (value <= startTime) {
        throw new Error('Data de fim deve ser após data de início');
      }
      return true;
    }),
  body('maxParticipants')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Máximo de participantes inválido')
    .toInt(),
  body('notes')
    .optional()
    .isString().withMessage('Notas inválidas')
    .isLength({ max: 255 }).withMessage('Notas inválidas')
    .trim(),
];

module.exports = { bookingSchema };
