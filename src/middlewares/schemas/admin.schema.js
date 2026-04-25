const { body, param } = require('express-validator');
const { toAppRole } = require('../../utils/roles');

const createUserSchema = [
    body('firstName')
        .isLength({ min: 2, max: 150 }).withMessage('Nome inválido')
        .trim(),
    body('lastName')
        .optional({ values: 'falsy' })
        .isLength({ min: 2, max: 150 }).withMessage('Apelido inválido')
        .trim(),
    body('email')
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    body('phoneNumber')
        .optional({ values: 'falsy' })
        .isLength({ min: 3, max: 20 }).withMessage('Telefone inválido')
        .trim(),
    body('password')
        .isLength({ min: 8 }).withMessage('Password deve ter no mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Password deve conter pelo menos uma letra maiúscula')
        .matches(/[a-z]/).withMessage('Password deve conter pelo menos uma letra minúscula')
        .matches(/[0-9]/).withMessage('Password deve conter pelo menos um número'),
    body('role')
        .custom((value) => Boolean(toAppRole(value))).withMessage('Role inválida')
        .trim(),
    body('birthDate')
        .optional({ values: 'falsy' })
        .isISO8601().withMessage('Data de nascimento inválida')
        .toDate(),
    body('guardianName')
        .optional({ values: 'falsy' })
        .isLength({ min: 2, max: 150 }).withMessage('Nome do encarregado inválido')
        .trim(),
    body('guardianPhone')
        .optional({ values: 'falsy' })
        .isLength({ min: 3, max: 20 }).withMessage('Telefone do encarregado inválido')
        .trim(),
];

const resetUserPasswordSchema = [
    param('id')
        .isInt({ min: 1 }).withMessage('User id inválido')
        .toInt(),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password deve ter no mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Password deve conter pelo menos uma letra maiúscula')
        .matches(/[a-z]/).withMessage('Password deve conter pelo menos uma letra minúscula')
        .matches(/[0-9]/).withMessage('Password deve conter pelo menos um número')
        .trim()
        .escape()
];

module.exports = {
    createUserSchema,
    resetUserPasswordSchema,
};
