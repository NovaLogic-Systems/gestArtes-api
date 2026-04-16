const { body, param } = require('express-validator');

const createLostAndFoundItemSchema = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Invalid title')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid description')
    .escape(),
  body('foundDate')
    .isISO8601().withMessage('Invalid foundDate')
    .toDate(),
  body('claimedStatus')
    .optional()
    .isBoolean().withMessage('Invalid claimedStatus')
    .toBoolean(),
  body('photoUrl')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid photoUrl')
    .isURL({ require_protocol: false }).withMessage('Invalid photoUrl'),
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid adminNotes')
    .escape(),
];

const updateLostAndFoundItemSchema = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Invalid title')
    .escape(),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid description')
    .escape(),
  body('foundDate')
    .optional()
    .isISO8601().withMessage('Invalid foundDate')
    .toDate(),
  body('claimedStatus')
    .optional()
    .isBoolean().withMessage('Invalid claimedStatus')
    .toBoolean(),
  body('photoUrl')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid photoUrl')
    .isURL({ require_protocol: false }).withMessage('Invalid photoUrl'),
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid adminNotes')
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
        throw new Error('Request body must include at least one field');
      }

      return true;
    }),
];

const itemIdParamSchema = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid item id')
    .toInt(),
];

const claimLostAndFoundItemSchema = [
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid adminNotes')
    .escape(),
];

const archiveLostAndFoundItemSchema = [
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Invalid adminNotes')
    .escape(),
];

module.exports = {
  createLostAndFoundItemSchema,
  updateLostAndFoundItemSchema,
  itemIdParamSchema,
  claimLostAndFoundItemSchema,
  archiveLostAndFoundItemSchema,
};