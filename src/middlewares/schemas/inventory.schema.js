const { body, param, query } = require('express-validator');

const createInventoryItemSchema = [
  body('itemName')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Nome do artigo inválido')
    .escape(),
  body('categoryId')
    .isInt({ min: 1 }).withMessage('Categoria inválida')
    .toInt(),
  body('symbolicFee')
    .isFloat({ min: 0 }).withMessage('Taxa simbólica inválida')
    .toFloat(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Descrição inválida')
    .escape(),
  body('photoUrl')
    .optional()
    .isURL({ require_protocol: false }).withMessage('URL da foto inválida'),
  body('totalQuantity')
    .optional()
    .isInt({ min: 1 }).withMessage('Quantidade inválida')
    .toInt(),
];

const createInventoryTransactionSchema = [
  body('inventoryItemId')
    .isInt({ min: 1 }).withMessage('Artigo inválido')
    .toInt(),
  body('startDate')
    .isISO8601().withMessage('Data de início inválida')
    .toDate(),
  body('endDate')
    .optional()
    .isISO8601().withMessage('Data de fim inválida')
    .toDate()
    .custom((endDate, { req }) => {
      if (req.body.startDate && endDate < req.body.startDate) {
        throw new Error('Data de fim inválida');
      }

      return true;
    }),
  body('paymentMethodId')
    .isInt({ min: 1 }).withMessage('Método de pagamento inválido')
    .toInt(),
];

const inventoryItemIdParamSchema = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID de artigo inválido')
    .toInt(),
];

const listInventoryItemsQuerySchema = [
  query('category')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Categoria inválida')
    .escape(),
  query('onlyAvailable')
  query('categoryId')
    .optional()
    .isInt({ min: 1 }).withMessage('Categoria inválida')
    .toInt(),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Pesquisa inválida')
    .escape(),
  query('availableOnly')
    .optional()
    .isBoolean().withMessage('Filtro de disponibilidade inválido')
    .toBoolean(),
];

module.exports = {
  createInventoryItemSchema,
  createInventoryTransactionSchema,
  inventoryItemIdParamSchema,
  listInventoryItemsQuerySchema,
};