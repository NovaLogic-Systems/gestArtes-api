const { query } = require('express-validator');

const auditQuerySchema = [
  query('periodStart')
    .optional()
    .isISO8601().withMessage('periodStart inválida')
    .toDate(),
  query('periodEnd')
    .optional()
    .isISO8601().withMessage('periodEnd inválida')
    .toDate(),
  query('module')
    .optional()
    .trim()
    .isLength({ max: 30 }).withMessage('module inválido'),
  query('action')
    .optional()
    .trim()
    .isLength({ max: 60 }).withMessage('action inválida'),
  query('userId')
    .optional()
    .isInt({ min: 1 }).withMessage('userId inválido')
    .toInt(),
  query('result')
    .optional()
    .isIn(['success', 'failure']).withMessage('result deve ser success ou failure'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('limit deve estar entre 1 e 500')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset inválido')
    .toInt(),
];

const auditSummaryQuerySchema = [
  query('periodStart')
    .optional()
    .isISO8601().withMessage('periodStart inválida')
    .toDate(),
  query('periodEnd')
    .optional()
    .isISO8601().withMessage('periodEnd inválida')
    .toDate(),
];

module.exports = { auditQuerySchema, auditSummaryQuerySchema };
