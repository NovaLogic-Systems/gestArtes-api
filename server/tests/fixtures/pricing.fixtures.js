function buildPricingSession({
  sessionId = 10,
  hourlyRate = 36,
  durationHours = 1,
  isExternal = false,
  isOutsideStdHours = false,
} = {}) {
  const startTime = new Date('2026-05-10T10:00:00.000Z');
  const endTime = new Date(startTime.getTime() + durationHours * 3_600_000);

  return {
    SessionID: sessionId,
    StartTime: startTime,
    EndTime: endTime,
    IsExternal: isExternal,
    IsOutsideStdHours: isOutsideStdHours,
    SessionPricingRate: {
      HourlyRate: hourlyRate,
    },
  };
}

module.exports = {
  buildPricingSession,
};
