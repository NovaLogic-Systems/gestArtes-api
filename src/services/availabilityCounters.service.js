/**
 * @file src/services/availabilityCounters.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

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

