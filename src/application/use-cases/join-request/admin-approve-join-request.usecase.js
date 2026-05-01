/**
 * @file src/application/use-cases/join-request/admin-approve-join-request.usecase.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const logger = require('../../../utils/logger');

/**
 * admin-approve-join-request.usecase.js
 *
 * SD-06 Step 3a: Admin approves a pending join request.
 * This orchestrates: validate + approve → create enrollment → return student ID for notification.
 *
 * Orchestration (side effects):
 * - joinRequestService.adminApprove() validates admin permission & moves to Approved state
 * - Creates sessionStudent enrollment (Prisma transaction in service)
 * - Notification delivery to student is delegated to controller layer
 *
 * @param {Object} deps - Dependency injection object
 * @param {Object} deps.joinRequestService - Service with adminApprove method
 * @returns {Object} Usecase object with execute method
 */
function createAdminApproveJoinRequestUseCase({ joinRequestService }) {
  return {
    async execute({ req, adminUserId, payload }) {
      const { joinRequestId } = payload;

      // Business logic: approve + enroll (both in service transaction)
      const result = await joinRequestService.adminApprove({
        joinRequestId,
        adminUserId,
      });

      logger.info('[JoinRequest] Admin approved & enrolled', {
        joinRequestId,
        adminUserId,
        studentUserId: result.studentUserId,
      });

      return {
        joinRequest: result.joinRequest,
        studentUserId: result.studentUserId,
      };
    },
  };
}

module.exports = { createAdminApproveJoinRequestUseCase };

