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