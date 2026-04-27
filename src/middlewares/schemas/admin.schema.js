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
    body('studentNumber')
        .optional({ values: 'falsy' })
        .isLength({ min: 2, max: 100 }).withMessage('Número de aluno inválido')
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
    body()
        .custom((value) => {
            const role = toAppRole(value?.role);
            const studentNumber = String(value?.studentNumber || '').trim();

            if (role === 'student' && !studentNumber) {
                throw new Error('Número de aluno é obrigatório para alunos');
            }

            if (role !== 'student' && studentNumber) {
                throw new Error('Número de aluno só é aplicável a utilizadores aluno');
            }

            return true;
        }),
];

const userIdParam = param('id')
    .isInt({ min: 1 }).withMessage('User id inválido')
    .toInt();

const updateUserSchema = [
    userIdParam,
    body('firstName')
        .optional()
        .isLength({ min: 2, max: 150 }).withMessage('Nome inválido')
        .trim(),
    body('lastName')
        .optional({ values: 'falsy' })
        .isLength({ min: 2, max: 150 }).withMessage('Apelido inválido')
        .trim(),
    body('email')
        .optional()
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    body('phoneNumber')
        .optional({ values: 'falsy' })
        .isLength({ min: 3, max: 20 }).withMessage('Telefone inválido')
        .trim(),
    body('isActive')
        .optional()
        .isBoolean().withMessage('Estado inválido')
        .toBoolean(),
    body('studentNumber')
        .optional({ values: 'falsy' })
        .isLength({ min: 2, max: 100 }).withMessage('Número de aluno inválido')
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
    body()
        .custom((value) => {
            const allowedKeys = [
                'firstName',
                'lastName',
                'email',
                'phoneNumber',
                'isActive',
                'studentNumber',
                'birthDate',
                'guardianName',
                'guardianPhone',
            ];

            const hasAnyField = allowedKeys.some((key) => Object.prototype.hasOwnProperty.call(value || {}, key));

            if (!hasAnyField) {
                throw new Error('Nenhum campo para atualizar foi enviado');
            }

            return true;
        }),
];

const deleteUserSchema = [
    userIdParam,
];

const updateUserRolesSchema = [
    userIdParam,
    body('role')
        .optional({ values: 'falsy' })
        .custom((value) => Boolean(toAppRole(value))).withMessage('Role inválida')
        .trim(),
    body('roles')
        .optional()
        .isArray({ min: 1 }).withMessage('Roles inválidas'),
    body('roles.*')
        .optional()
        .custom((value) => Boolean(toAppRole(value))).withMessage('Role inválida'),
    body('studentNumber')
        .optional({ values: 'falsy' })
        .isLength({ min: 2, max: 100 }).withMessage('Número de aluno inválido')
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
    body()
        .custom((value) => {
            const hasRole = Object.prototype.hasOwnProperty.call(value || {}, 'role');
            const hasRoles = Array.isArray(value?.roles) && value.roles.length > 0;

            if (!hasRole && !hasRoles) {
                throw new Error('Pelo menos uma role deve ser enviada');
            }

            return true;
        }),
];

const resetUserPasswordSchema = [
    userIdParam,
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password deve ter no mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Password deve conter pelo menos uma letra maiúscula')
        .matches(/[a-z]/).withMessage('Password deve conter pelo menos uma letra minúscula')
        .matches(/[0-9]/).withMessage('Password deve conter pelo menos um número')
];

module.exports = {
    createUserSchema,
    deleteUserSchema,
    resetUserPasswordSchema,
    updateUserRolesSchema,
    updateUserSchema,
};
