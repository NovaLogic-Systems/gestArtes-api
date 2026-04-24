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
      return res.status(400).json({ error: 'ID de sessão inválido' });
    }

    const requesterUserId = toPositiveInt(req.session?.userId);

    if (!requesterUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await joinRequestService.createJoinRequest({
      sessionId,
      requesterUserId,
    });

    await notifyUsers(
      req,
      result.teacherUserIds,
      `Novo pedido de adesão à sessão #${sessionId} pendente da sua aprovação.`
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
      return res.status(400).json({ error: 'ID de sessão inválido' });
    }

    const requesterUserId = toPositiveInt(req.session?.userId);
    const requesterRole = String(req.session?.role || '').trim().toLowerCase();

    if (!requesterUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
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
      return res.status(401).json({ error: 'Não autenticado' });
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
      return res.status(400).json({ error: 'ID de pedido de adesão inválido' });
    }

    if (!teacherUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await joinRequestService.teacherApprove({
      joinRequestId,
      teacherUserId,
    });

    await notifyUsers(
      req,
      result.adminUserIds,
      `O pedido de adesão #${joinRequestId} foi aprovado pelo professor e aguarda aprovação da gestão.`
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
      return res.status(400).json({ error: 'ID de pedido de adesão inválido' });
    }

    if (!teacherUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await joinRequestService.teacherReject({
      joinRequestId,
      teacherUserId,
    });

    if (result.studentUserId) {
      await sendNotification(req, {
        userId: result.studentUserId,
        type: 'join_request',
        message: `O seu pedido de adesão #${joinRequestId} foi rejeitado pelo professor.`,
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
      return res.status(400).json({ error: 'ID de pedido de adesão inválido' });
    }

    if (!adminUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await joinRequestService.adminApprove({
      joinRequestId,
      adminUserId,
    });

    if (result.studentUserId) {
      await sendNotification(req, {
        userId: result.studentUserId,
        type: 'join_request',
        message: `O seu pedido de adesão #${joinRequestId} foi aprovado. Já está inscrito na sessão.`,
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
      return res.status(400).json({ error: 'ID de pedido de adesão inválido' });
    }

    if (!adminUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await joinRequestService.adminReject({
      joinRequestId,
      adminUserId,
    });

    if (result.studentUserId) {
      await sendNotification(req, {
        userId: result.studentUserId,
        type: 'join_request',
        message: `O seu pedido de adesão #${joinRequestId} foi rejeitado pela gestão.`,
      });
    }

    return res.json(result.joinRequest);
  } catch (error) {
    return next(error);
  }
}

async function getStudentRequests(req, res, next) {
  try {
    const studentUserId = toPositiveInt(req.session?.userId);

    if (!studentUserId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const requests = await joinRequestService.listStudentRequests({
      studentUserId,
    });

    return res.json({ requests });
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
  getStudentRequests,
};
