/**
 * @file src/application/use-cases/join-request/teacher-approve-join-request.usecase.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const logger = require('../../../utils/logger');

/**
 * teacher-approve-join-request.usecase.js
 *
 * SD-06 Step 2: Teacher approves a pending join request.
 * This orchestrates: validate + approve → gather admin IDs → return for notification.
 *
 * Orchestration (side effects):
 * - joinRequestService.teacherApprove() validates teacher access & moves to PendingAdmin
 * - Notification delivery to admins is delegated to the controller layer
 *
 * @param {Object} deps - Dependency injection object
 * @param {Object} deps.joinRequestService - Service with teacherApprove method
 * @returns {Object} Usecase object with execute method
 */
function createTeacherApproveJoinRequestUseCase({ joinRequestService }) {
  return {
    async execute({ req, teacherUserId, payload }) {
      const { joinRequestId } = payload;

      // Business logic: approve request (teacher permission check is in service)
      const result = await joinRequestService.teacherApprove({
        joinRequestId,
        teacherUserId,
      });

      logger.info('[JoinRequest] Teacher approved', {
        joinRequestId,
        teacherUserId,
        adminCount: result.adminUserIds.length,
      });

      return {
        joinRequest: result.joinRequest,
        adminUserIds: result.adminUserIds,
      };
    },
  };
}

module.exports = { createTeacherApproveJoinRequestUseCase };

