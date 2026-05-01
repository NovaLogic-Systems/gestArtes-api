/**
 * @file src/middlewares/schemas/studioOccupancy.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { body, param, query } = require('express-validator');

const MANUAL_STATUSES = ['available', 'occupied', 'blocked', 'maintenance', 'unavailable'];
const DDMMYYYY_PATTERN = /^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function isSupportedDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return false;
  }

  if (DDMMYYYY_PATTERN.test(raw)) {
    return true;
  }

  const parsed = new Date(raw);
  return !Number.isNaN(parsed.getTime());
}

const getStudioOccupancySchema = [
  query('at')
    .optional()
    .custom(isSupportedDateInput)
    .withMessage('Parâmetro at deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
];

const getStudioOccupancyForecastSchema = [
  query('from')
    .optional()
    .custom(isSupportedDateInput)
    .withMessage('Parâmetro from deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
  query('to')
    .optional()
    .custom(isSupportedDateInput)
    .withMessage('Parâmetro to deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
];

const blockStudioSchema = [
  body('studioId')
    .isInt({ min: 1 })
    .withMessage('studioId inválido')
    .toInt(),
  body('startsAt')
    .custom(isSupportedDateInput)
    .withMessage('startsAt deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
  body('endsAt')
    .custom(isSupportedDateInput)
    .withMessage('endsAt deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('reason deve ter no máximo 255 caracteres')
    .trim(),
  body('blockType')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('blockType inválido')
    .trim()
    .toLowerCase(),
];

const updateStudioStatusSchema = [
  param('studioId')
    .isInt({ min: 1 })
    .withMessage('studioId inválido')
    .toInt(),
  body('status')
    .isString()
    .custom((value) => MANUAL_STATUSES.includes(String(value || '').trim().toLowerCase()))
    .withMessage(`status inválido. Valores permitidos: ${MANUAL_STATUSES.join(', ')}`)
    .trim()
    .toLowerCase(),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('reason deve ter no máximo 255 caracteres')
    .trim(),
  body('startsAt')
    .optional()
    .custom(isSupportedDateInput)
    .withMessage('startsAt deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
  body('endsAt')
    .optional()
    .custom(isSupportedDateInput)
    .withMessage('endsAt deve ser uma data válida (DD-MM-YYYY ou ISO-8601)'),
];

module.exports = {
  getStudioOccupancySchema,
  getStudioOccupancyForecastSchema,
  blockStudioSchema,
  updateStudioStatusSchema,
};

