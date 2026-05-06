/**
 * @file src/application/use-cases/admin-sessions/index.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { createApproveSessionUseCase } = require('./approve-session.usecase');
const { createRejectSessionUseCase } = require('./reject-session.usecase');

function createAdminSessionUseCases({ prisma }) {
  return {
    approveSession: createApproveSessionUseCase({ prisma }),
    rejectSession: createRejectSessionUseCase({ prisma }),
  };
}

module.exports = {
  createAdminSessionUseCases,
};
