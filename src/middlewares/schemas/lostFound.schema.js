/**
 * @file src/middlewares/schemas/lostFound.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { body, param } = require('express-validator');

const createLostAndFoundItemSchema = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Titulo invalido')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Descricao invalida')
    .escape(),
  body('foundDate')
    .isISO8601().withMessage('Data de descoberta invalida')
    .toDate(),
  body('claimedStatus')
    .optional()
    .isBoolean().withMessage('Estado de reclamacao invalido')
    .toBoolean(),
  body('photoUrl')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('URL da foto invalida')
    .isURL({ require_protocol: false }).withMessage('URL da foto invalida'),
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas do administrador invalidas')
    .escape(),
];

const updateLostAndFoundItemSchema = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Titulo invalido')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Descricao invalida')
    .escape(),
  body('foundDate')
    .optional()
    .isISO8601().withMessage('Data de descoberta invalida')
    .toDate(),
  body('claimedStatus')
    .optional()
    .isBoolean().withMessage('Estado de reclamacao invalido')
    .toBoolean(),
  body('photoUrl')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('URL da foto invalida')
    .isURL({ require_protocol: false }).withMessage('URL da foto invalida'),
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas do administrador invalidas')
    .escape(),
  body()
    .custom((value) => {
      const hasAtLeastOneField = [
        'title',
        'description',
        'foundDate',
        'claimedStatus',
        'photoUrl',
        'adminNotes',
      ].some((field) => Object.hasOwn(value || {}, field));

      if (!hasAtLeastOneField) {
        throw new Error('O corpo do pedido deve incluir pelo menos um campo');
      }

      return true;
    }),
];

const itemIdParamSchema = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID do item invalido')
    .toInt(),
];

const claimLostAndFoundItemSchema = [
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas do administrador invalidas')
    .escape(),
];

const archiveLostAndFoundItemSchema = [
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Notas do administrador invalidas')
    .escape(),
];

module.exports = {
  createLostAndFoundItemSchema,
  updateLostAndFoundItemSchema,
  itemIdParamSchema,
  claimLostAndFoundItemSchema,
  archiveLostAndFoundItemSchema,
};
