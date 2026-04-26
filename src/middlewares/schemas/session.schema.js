const { body } = require('express-validator');

function validateEndAfterStart(startField, message) {
  return (endValue, { req }) => {
    const startValue = req.body[startField];

    if (!startValue || !endValue) {
      return true;
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return true;
    }

    if (endDate <= startDate) {
      throw new Error(message);
    }

    return true;
  };
}

const createSessionSchema = [
  body('studioId')
    .isInt({ min: 1 }).withMessage('Studio inválido')
    .toInt(),
  body('startTime')
    .isISO8601().withMessage('Data de início inválida')
    .toDate(),
  body('endTime')
    .isISO8601().withMessage('Data de fim inválida')
    .custom(validateEndAfterStart('startTime', 'Data de fim inválida'))
    .toDate(),
  body('modalityId')
    .isInt({ min: 1 }).withMessage('Modalidade inválida')
    .toInt(),
  body('pricingRateId')
    .isInt({ min: 1 }).withMessage('Tabela de preço inválida')
    .toInt(),
  body('statusId')
    .isInt({ min: 1 }).withMessage('Estado da sessão inválido')
    .toInt(),
  body('teacherIds')
    .isArray({ min: 1 }).withMessage('Lista de professores inválida')
    .bail()
    .custom((teacherIds) => teacherIds.every((id) => Number.isInteger(Number(id)) && Number(id) > 0))
    .withMessage('Lista de professores inválida'),
  body('assignmentRoleId')
    .optional()
    .isInt({ min: 1 }).withMessage('Papel de atribuição inválido')
    .toInt(),
  body('maxParticipants')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Capacidade inválida')
    .toInt(),
  body('isExternal')
    .optional()
    .isBoolean().withMessage('Indicador externo inválido')
    .toBoolean(),
  body('isOutsideStdHours')
    .optional()
    .isBoolean().withMessage('Indicador fora de horário inválido')
    .toBoolean(),
  body('reviewNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas inválidas')
    .escape(),
];

const updateSessionSchema = [
  body('studioId')
    .optional()
    .isInt({ min: 1 }).withMessage('Studio inválido')
    .toInt(),
  body('startTime')
    .optional()
    .isISO8601().withMessage('Data de início inválida')
    .toDate(),
  body('endTime')
    .optional()
    .isISO8601().withMessage('Data de fim inválida')
    .custom(validateEndAfterStart('startTime', 'Data de fim inválida'))
    .toDate(),
  body('modalityId')
    .optional()
    .isInt({ min: 1 }).withMessage('Modalidade inválida')
    .toInt(),
  body('pricingRateId')
    .optional()
    .isInt({ min: 1 }).withMessage('Tabela de preço inválida')
    .toInt(),
  body('maxParticipants')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Capacidade inválida')
    .toInt(),
  body('isExternal')
    .optional()
    .isBoolean().withMessage('Indicador externo inválido')
    .toBoolean(),
  body('isOutsideStdHours')
    .optional()
    .isBoolean().withMessage('Indicador fora de horário inválido')
    .toBoolean(),
  body('cancellationReason')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Motivo inválido')
    .escape(),
];

module.exports = { createSessionSchema, updateSessionSchema };