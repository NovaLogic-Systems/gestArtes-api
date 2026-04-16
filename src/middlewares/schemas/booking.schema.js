const { body } = require('express-validator');

const createBookingSchema = [
  body('professor')
    .trim()
    .isLength({ min: 1, max: 150 }).withMessage('Professor inválido')
    .escape(),
  body('date')
    .isISO8601().withMessage('Data inválida')
    .toDate(),
  body('time')
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Hora inválida'),
  body('style')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Estilo inválido')
    .escape(),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas inválidas')
    .escape(),
];

module.exports = { createBookingSchema };