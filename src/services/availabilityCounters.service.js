const {
    getAvailability,
    getPendingExceptions,
} = require('./availability.service');

async function getTeacherAvailabilityCounters(teacherId) {
    const [availability, pending] = await Promise.all([
        getAvailability(teacherId),
        getPendingExceptions(teacherId),
    ]);

    return {
        teacherId,
        ...availability.summary,
        pendingExceptions: pending.summary.pendingExceptions,
        updatedAt: new Date().toISOString(),
    };
}

module.exports = {
    getTeacherAvailabilityCounters,
};
