const { body } = require('express-validator');

const createMarketplaceItemSchema = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Título inválido')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Descrição inválida')
    .escape(),
  body('price')
    .isFloat({ min: 0 }).withMessage('Preço inválido')
    .toFloat(),
  body('conditionId')
    .isInt({ min: 1 }).withMessage('Condição inválida')
    .toInt(),
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
  createMarketplaceTransactionSchema,
};