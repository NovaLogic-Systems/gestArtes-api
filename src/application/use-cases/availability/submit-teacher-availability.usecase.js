const logger = require('../../../utils/logger');

/**
 * submit-teacher-availability.usecase.js
 *
 * SD-07 Step 1: Teacher submits availability slots (recurring weekly or punctual semester).
 * This orchestrates: validate + create availability records → return summary.
 *
 * Orchestration (side effects):
 * - availabilityService.submitAvailability() creates slots in Pending state
 * - No notification delivery; controller handles admin notification externally
 *
 * @param {Object} deps - Dependency injection object
 * @param {Object} deps.availabilityService - Service with submitAvailability method
 * @returns {Object} Usecase object with execute method
 */
function createSubmitTeacherAvailabilityUseCase({ availabilityService }) {
  return {
    async execute({ req, teacherUserId, payload }) {
      // Business logic: submit availability in pending state
      const result = await availabilityService.submitAvailability(teacherUserId, payload);

      logger.info('[Availability] Teacher submitted availability', {
        teacherUserId,
        totalSlots: result.summary.totalSlots,
        weeklySlots: result.summary.weeklySlots,
        semesterSlots: result.summary.semesterSlots,
      });

      return {
        summary: result.summary,
        availability: result.availability,
      };
    },
  };
}

module.exports = { createSubmitTeacherAvailabilityUseCase };
