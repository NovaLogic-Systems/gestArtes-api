const { createCreateJoinRequestUseCase } = require('./create-join-request.usecase');
const { createTeacherApproveJoinRequestUseCase } = require('./teacher-approve-join-request.usecase');
const { createAdminApproveJoinRequestUseCase } = require('./admin-approve-join-request.usecase');

/**
 * index.js — Fábrica dos use-cases de JoinRequest
 *
 * Liga as dependências e exporta um objeto único com todos os use-cases.
 * É chamada uma única vez no arranque do servidor, durante a inicialização
 * do controlador.
 *
 * @param {Object} joinRequestService - Instância do serviço
 * @returns {Object} Objeto com as chaves: createJoinRequest, teacherApprove, adminApprove
 */
function createJoinRequestUseCases(dependencies) {
  const deps = dependencies;

  return {
    createJoinRequest: createCreateJoinRequestUseCase(deps),
    teacherApprove: createTeacherApproveJoinRequestUseCase(deps),
    adminApprove: createAdminApproveJoinRequestUseCase(deps),
  };
}

module.exports = { createJoinRequestUseCases };
