const { body, param, query } = require('express-validator');

function isValidPhotoUrl(value) {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  const normalized = String(value).trim();

  if (normalized.startsWith('/uploads/')) {
    return true;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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
    .trim()
    .isLength({ max: 255 }).withMessage('URL da foto inválida')
    .custom((value) => isValidPhotoUrl(value)).withMessage('URL da foto inválida'),
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
    .optional()
    .isBoolean().withMessage('Filtro de disponibilidade inválido')
    .toBoolean(),
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

const updateInventoryItemSchema = [
  body('itemName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Nome do artigo inválido')
    .escape(),
  body('categoryId')
    .optional()
    .isInt({ min: 1 }).withMessage('Categoria inválida')
    .toInt(),
  body('symbolicFee')
    .optional()
    .isFloat({ min: 0 }).withMessage('Taxa simbólica inválida')
    .toFloat(),
  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Descrição inválida')
    .escape(),
  body('photoUrl')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('URL da foto inválida')
    .custom((value) => isValidPhotoUrl(value)).withMessage('URL da foto inválida'),
  body('totalQuantity')
    .optional()
    .isInt({ min: 0 }).withMessage('Quantidade inválida')
    .toInt(),
  body()
    .custom((value) => {
      const hasAnyField = ['itemName', 'categoryId', 'symbolicFee', 'description', 'photoUrl', 'totalQuantity']
        .some((field) => Object.hasOwn(value || {}, field));

      if (!hasAnyField) {
        throw new Error('O corpo do pedido deve incluir pelo menos um campo');
      }

      return true;
    }),
];

const updateInventoryAvailabilitySchema = [
  body('isAvailable')
    .optional()
    .isBoolean().withMessage('Estado de disponibilidade inválido')
    .toBoolean(),
  body('totalQuantity')
    .optional()
    .isInt({ min: 0 }).withMessage('Quantidade inválida')
    .toInt(),
  body()
    .custom((value) => {
      const hasAnyField = ['isAvailable', 'totalQuantity']
        .some((field) => Object.hasOwn(value || {}, field));

      if (!hasAnyField) {
        throw new Error('O corpo do pedido deve incluir pelo menos um campo');
      }

      return true;
    }),
];

const inventoryRentalIdParamSchema = [
  param('rentalId')
    .isInt({ min: 1 }).withMessage('ID de aluguer inválido')
    .toInt(),
];

const verifyReturnSchema = [
  body('returnDate')
    .isISO8601().withMessage('Data de devolução inválida')
    .toDate(),
  body('conditionStatus')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Estado de condição inválido')
    .escape(),
  body('conditionNotes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Notas de condição inválidas')
    .escape(),
];

module.exports = {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  createInventoryTransactionSchema,
  inventoryItemIdParamSchema,
  inventoryRentalIdParamSchema,
  listInventoryItemsQuerySchema,
  updateInventoryAvailabilitySchema,
  verifyReturnSchema,
};