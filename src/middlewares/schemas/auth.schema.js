/**
 * @file src/middlewares/schemas/auth.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { body } = require('express-validator');

const loginSchema = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .trim()
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password deve ter no mínimo 8 caracteres'),
];

module.exports = { loginSchema };

