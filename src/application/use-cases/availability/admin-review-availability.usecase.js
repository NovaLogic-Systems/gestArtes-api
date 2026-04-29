const logger = require('../../../utils/logger');

/**
 * admin-review-availability.usecase.js
 *
 * SD-07 Step 2: Admin reviews pending teacher availability for conflicts/gaps.
 * This orchestrates: validate admin permission + approve/reject → return updated availability.
 *
 * Orchestration (side effects):
 * - availabilityService.reviewAvailability() validates state and applies decision
 * - Moves to Approved or Rejected status
 * - No notification delivery; controller handles notification based on decision
 *
 * @param {Object} deps - Dependency injection object
 * @param {Object} deps.availabilityService - Service with reviewAvailability method
 * @returns {Object} Usecase object with execute method
 */
function createAdminReviewAvailabilityUseCase({ availabilityService }) {
  return {
    async execute({ req, adminUserId, payload }) {
      const { availabilityId, decision, reviewNotes } = payload;

      // Business logic: review availability (admin validation in service)
      const result = await availabilityService.reviewAvailability(
        availabilityId,
        adminUserId,
        decision,
        reviewNotes || null
      );

      logger.info('[Availability] Admin reviewed availability', {
        availabilityId,
        adminUserId,
        decision,
        status: result.status,
      });

      return {
        availability: result,
      };
    },
  };
}

module.exports = { createAdminReviewAvailabilityUseCase };
