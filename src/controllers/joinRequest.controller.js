const joinRequestService = require('../services/joinRequest.service');
const { sendNotification } = require('./notification.controller');

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function notifyUsers(req, userIds, message) {
  for (const userId of userIds) {
    await sendNotification(req, {
      userId,
      type: 'join_request',
      message,
    });
  }
}

async function createJoinRequest(req, res, next) {
  try {
    const sessionId = toPositiveInt(req.params.id);

    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid session id' });
    }

    const requesterUserId = toPositiveInt(req.session?.userId);

    if (!requesterUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await joinRequestService.createJoinRequest({
      sessionId,
      requesterUserId,
    });

    await notifyUsers(
      req,
      result.teacherUserIds,
      `New join request for session #${sessionId} is pending your approval.`
    );

    return res.status(201).json(result.joinRequest);
  } catch (error) {
    return next(error);
  }
}

async function listBySession(req, res, next) {
  try {
    const sessionId = toPositiveInt(req.params.id);

    if (!sessionId) {
      return res.status(400).json({ error: 'Invalid session id' });
    }

    const requesterUserId = toPositiveInt(req.session?.userId);
    const requesterRole = String(req.session?.role || '').trim().toLowerCase();

    if (!requesterUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requests = await joinRequestService.listJoinRequestsBySession({
      sessionId,
      requesterUserId,
      requesterRole,
    });

    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function getTeacherPending(req, res, next) {
  try {
    const teacherUserId = toPositiveInt(req.session?.userId);

    if (!teacherUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requests = await joinRequestService.listTeacherPendingRequests({
      teacherUserId,
    });

    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function teacherApprove(req, res, next) {
  try {
    const joinRequestId = toPositiveInt(req.params.id);
    const teacherUserId = toPositiveInt(req.session?.userId);

    if (!joinRequestId) {
      return res.status(400).json({ error: 'Invalid join request id' });
    }

    if (!teacherUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await joinRequestService.teacherApprove({
      joinRequestId,
      teacherUserId,
    });

    await notifyUsers(
      req,
      result.adminUserIds,
      `Join request #${joinRequestId} was approved by teacher and is pending admin approval.`
    );

    return res.json(result.joinRequest);
  } catch (error) {
    return next(error);
  }
}

async function teacherReject(req, res, next) {
  try {
    const joinRequestId = toPositiveInt(req.params.id);
    const teacherUserId = toPositiveInt(req.session?.userId);

    if (!joinRequestId) {
      return res.status(400).json({ error: 'Invalid join request id' });
    }

    if (!teacherUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await joinRequestService.teacherReject({
      joinRequestId,
      teacherUserId,
    });

    if (result.studentUserId) {
      await sendNotification(req, {
        userId: result.studentUserId,
        type: 'join_request',
        message: `Your join request #${joinRequestId} was rejected by teacher.`,
      });
    }

    return res.json(result.joinRequest);
  } catch (error) {
    return next(error);
  }
}

async function getAdminPending(req, res, next) {
  try {
    const requests = await joinRequestService.listAdminPendingRequests();
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function adminApprove(req, res, next) {
  try {
    const joinRequestId = toPositiveInt(req.params.id);
    const adminUserId = toPositiveInt(req.session?.userId);

    if (!joinRequestId) {
      return res.status(400).json({ error: 'Invalid join request id' });
    }

    if (!adminUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await joinRequestService.adminApprove({
      joinRequestId,
      adminUserId,
    });

    if (result.studentUserId) {
      await sendNotification(req, {
        userId: result.studentUserId,
        type: 'join_request',
        message: `Your join request #${joinRequestId} was approved. You are now enrolled in the session.`,
      });
    }

    return res.json(result.joinRequest);
  } catch (error) {
    return next(error);
  }
}

async function adminReject(req, res, next) {
  try {
    const joinRequestId = toPositiveInt(req.params.id);
    const adminUserId = toPositiveInt(req.session?.userId);

    if (!joinRequestId) {
      return res.status(400).json({ error: 'Invalid join request id' });
    }

    if (!adminUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await joinRequestService.adminReject({
      joinRequestId,
      adminUserId,
    });

    if (result.studentUserId) {
      await sendNotification(req, {
        userId: result.studentUserId,
        type: 'join_request',
        message: `Your join request #${joinRequestId} was rejected by admin.`,
      });
    }

    return res.json(result.joinRequest);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createJoinRequest,
  listBySession,
  getTeacherPending,
  teacherApprove,
  teacherReject,
  getAdminPending,
  adminApprove,
  adminReject,
};
