const { body } = require('express-validator');

const createTeacherSessionSchema = [
  body('date')
    .isISO8601().withMessage('date deve ser ISO8601')
    .toDate()
    .custom((value) => {
      if (value <= new Date()) {
        throw new Error('date deve ser no futuro');
      }
      return true;
    }),
  body('studioId')
    .isInt({ min: 1 }).withMessage('studioId deve ser um inteiro positivo')
    .toInt(),
  body('modalityId')
    .isInt({ min: 1 }).withMessage('modalityId deve ser um inteiro positivo')
    .toInt(),
  body('capacity')
    .isInt({ min: 1 }).withMessage('capacity deve ser um inteiro positivo')
    .toInt(),
  body('pricingRateId')
    .optional()
    .isInt({ min: 1 }).withMessage('pricingRateId deve ser um inteiro positivo')
    .toInt(),
  body('isExternal')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('isExternal deve ser booleano')
    .toBoolean(),
  body('isOutsideStdHours')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('isOutsideStdHours deve ser booleano')
    .toBoolean(),
];

module.exports = { createTeacherSessionSchema };