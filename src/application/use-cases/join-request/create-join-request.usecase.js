const logger = require('../../../utils/logger');

/**
 * create-join-request.usecase.js
 *
 * SD-06 Step 1: Student creates join request for a coaching session.
 * This orchestrates: create request → gather teacher IDs → return for notification.
 *
 * Orchestration (side effects):
 * - joinRequestService.createJoinRequest() creates the pending request
 * - Notification delivery is delegated to the controller layer
 *
 * @param {Object} deps - Dependency injection object
 * @param {Object} deps.joinRequestService - Service with createJoinRequest method
 * @returns {Object} Usecase object with execute method
 */
function createCreateJoinRequestUseCase({ joinRequestService }) {
  return {
    async execute({ req, studentUserId, payload }) {
      const { sessionId } = payload;

      // Business logic: create request in pending state
      const result = await joinRequestService.createJoinRequest({
        sessionId,
        requesterUserId: studentUserId,
      });

      logger.info('[JoinRequest] Created request', {
        joinRequestId: result.joinRequest.joinRequestId,
        sessionId,
        studentUserId,
        teacherCount: result.teacherUserIds.length,
      });

      return {
        joinRequest: result.joinRequest,
        teacherUserIds: result.teacherUserIds,
      };
    },
  };
}

module.exports = { createCreateJoinRequestUseCase };
