const { createAdminCreateUserUseCase } = require('./create-user.usecase');

function createAdminUserUseCases({ prisma, passwordHashRounds }) {
  return {
    createUser: createAdminCreateUserUseCase({ prisma, passwordHashRounds }),
  };
}

module.exports = {
  createAdminUserUseCases,
};