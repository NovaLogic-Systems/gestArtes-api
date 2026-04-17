const { body } = require('express-validator');

const loginSchema = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),          // sanitização: lowercase, remove dots no Gmail
  body('password')
    .isLength({ min: 8 }).withMessage('Password deve ter no mínimo 8 caracteres')
    .trim()
    .escape(),                  // sanitização: escapa caracteres HTML (XSS)
];

module.exports = { loginSchema };
