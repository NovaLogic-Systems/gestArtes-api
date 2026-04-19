const { body, param } = require('express-validator');

const resetUserPasswordSchema = [
    param('id')
        .isInt({ min: 1 }).withMessage('User id inválido')
        .toInt(),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password deve ter no mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Password deve conter pelo menos uma letra maiúscula')
        .matches(/[a-z]/).withMessage('Password deve conter pelo menos uma letra minúscula')
        .matches(/[0-9]/).withMessage('Password deve conter pelo menos um número')
        .trim(),
];

module.exports = { resetUserPasswordSchema };