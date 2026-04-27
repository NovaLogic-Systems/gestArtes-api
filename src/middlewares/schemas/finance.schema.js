const { body, query } = require('express-validator');

const KNOWN_ENTRY_TYPES = [
  'session_revenue',
  'no_show_fee',
  'cancellation_fee',
  'inventory_fee',
  'marketplace_fee',
];

const periodStartQuery = query('periodStart')
  .optional()
  .isISO8601().withMessage('periodStart inválida')
  .toDate();

const periodEndQuery = query('periodEnd')
  .optional()
  .isISO8601().withMessage('periodEnd inválida')
  .toDate();

const studentAccountIdQuery = query('studentAccountId')
  .optional()
  .isInt({ min: 1 }).withMessage('studentAccountId inválido')
  .toInt();

const studentNumberQuery = query('studentNumber')
  .optional()
  .trim()
  .isLength({ max: 20 }).withMessage('studentNumber inválido');

const transactionsQuerySchema = [
  periodStartQuery,
  periodEndQuery,
  studentAccountIdQuery,
  studentNumberQuery,
  query('entryType')
    .optional()
    .isIn(KNOWN_ENTRY_TYPES).withMessage(`entryType deve ser um de: ${KNOWN_ENTRY_TYPES.join(', ')}`),
  query('isExported')
    .optional()
    .isBoolean().withMessage('isExported inválido')
    .toBoolean(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('limit deve estar entre 1 e 500')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset inválido')
    .toInt(),
];

const summaryQuerySchema = [
  periodStartQuery,
  periodEndQuery,
  studentAccountIdQuery,
  studentNumberQuery,
];

const revenueQuerySchema = [
  query('year')
    .optional()
    .isInt({ min: 2000, max: 2100 }).withMessage('year inválido')
    .toInt(),
  studentAccountIdQuery,
  studentNumberQuery,
];

const exportBodySchema = [
  body('periodStart')
    .isISO8601().withMessage('periodStart inválida')
    .toDate(),
  body('periodEnd')
    .isISO8601().withMessage('periodEnd inválida')
    .toDate(),
  body('studentAccountId')
    .optional()
    .isInt({ min: 1 }).withMessage('studentAccountId inválido')
    .toInt(),
  body('studentNumber')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('studentNumber inválido'),
  body('includeExported')
    .optional()
    .isBoolean().withMessage('includeExported inválido')
    .toBoolean(),
];

module.exports = {
  transactionsQuerySchema,
  summaryQuerySchema,
  revenueQuerySchema,
  exportBodySchema,
  KNOWN_ENTRY_TYPES,
};
