/**
 * @file src/application/use-cases/admin-users/index.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { createAdminCreateUserUseCase } = require('./create-user.usecase');

function createAdminUserUseCases({ prisma, passwordHashRounds }) {
  return {
    createUser: createAdminCreateUserUseCase({ prisma, passwordHashRounds }),
  };
}

module.exports = {
  createAdminUserUseCases,
};
