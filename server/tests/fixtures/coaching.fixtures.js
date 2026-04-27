function buildJoinRequest({
  joinRequestId = 500,
  sessionId = 42,
  studentAccountId = 701,
  status = 'PendingTeacher',
  reviewedByUserId = null,
  reviewedAt = null,
} = {}) {
  return {
    joinRequestId,
    sessionId,
    studentAccountId,
    requestedAt: new Date('2026-04-26T10:00:00.000Z').toISOString(),
    reviewedByUserId,
    reviewedAt,
    status,
    student: {
      userId: 200,
      firstName: 'Student',
      lastName: 'User',
      email: 'student@example.com',
    },
  };
}

module.exports = {
  buildJoinRequest,
};
