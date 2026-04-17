const { body, param, query } = require('express-validator');

const createMarketplaceItemSchema = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Título inválido')
    .escape(),
  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Descrição inválida')
    .escape(),
  body('price')
    .isFloat({ min: 0 }).withMessage('Preço inválido')
    .toFloat(),
  body('conditionId')
    .isInt({ min: 1 }).withMessage('Condição inválida')
    .toInt(),
  body('categoryId')
    .optional()
    .isInt({ min: 1 }).withMessage('Categoria inválida')
    .toInt(),
  body('photoUrl')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Foto inválida')
    .escape(),
  body('location')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Localização inválida')
    .escape(),
];

const updateMarketplaceItemSchema = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Título inválido')
    .escape(),
  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Descrição inválida')
    .escape(),
  body('price')
    .optional()
    .isFloat({ min: 0 }).withMessage('Preço inválido')
    .toFloat(),
  body('conditionId')
    .optional()
    .isInt({ min: 1 }).withMessage('Condição inválida')
    .toInt(),
  body('categoryId')
    .optional()
    .isInt({ min: 1 }).withMessage('Categoria inválida')
    .toInt(),
  body('photoUrl')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Foto inválida')
    .escape(),
  body('location')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Localização inválida')
    .escape(),
  body()
    .custom((value) => {
      const editableFields = [
        'title',
        'description',
        'price',
        'conditionId',
        'categoryId',
        'photoUrl',
        'location',
      ];
      const payload = value || {};
      const hasEditableField = editableFields.some((field) => {
        return Object.prototype.hasOwnProperty.call(payload, field);
      });

      if (!hasEditableField) {
        throw new Error('Nenhum campo para atualizar');
      }

      return true;
    }),
];

const marketplaceListingIdParamSchema = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID de anúncio inválido')
    .toInt(),
];

const listMarketplaceListingsQuerySchema = [
  query('category')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Categoria inválida')
    .escape(),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Preço mínimo inválido')
    .toFloat(),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Preço máximo inválido')
    .toFloat()
    .custom((maxPrice, { req }) => {
      if (req.query.minPrice !== undefined && Number(maxPrice) < Number(req.query.minPrice)) {
        throw new Error('Preço máximo inválido');
      }

      return true;
    }),
  query('location')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Localização inválida')
    .escape(),
];

const createMarketplaceTransactionSchema = [
  body('marketplaceItemId')
    .isInt({ min: 1 }).withMessage('Artigo inválido')
    .toInt(),
  body('paymentMethodId')
    .isInt({ min: 1 }).withMessage('Método de pagamento inválido')
    .toInt(),
];

module.exports = {
  createMarketplaceItemSchema,
  updateMarketplaceItemSchema,
  marketplaceListingIdParamSchema,
  listMarketplaceListingsQuerySchema,
  createMarketplaceTransactionSchema,
};