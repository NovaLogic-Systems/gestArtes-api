// notification.controller.js
const notificationService = require('../services/notification.service');

const ALLOWED_NOTIFICATION_TYPES = new Set([
    'coaching',
    'schedule',
    'system',
    'penalties',
    'join_requests',
]);

const sendNotification = async (req, { userId, type, message }) => {
    const parsedUserId = Number.parseInt(userId, 10);

    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
        const error = new Error('Invalid userId');
        error.statusCode = 400;
        throw error;
    }

    const normalizedType = String(type || '').trim().toLowerCase();
    if (!ALLOWED_NOTIFICATION_TYPES.has(normalizedType)) {
        const error = new Error('Invalid type');
        error.statusCode = 400;
        throw error;
    }

    if (typeof message !== 'string' || !message.trim()) {
        const error = new Error('Invalid message');
        error.statusCode = 400;
        throw error;
    }

    const notification = await notificationService.create(parsedUserId, message.trim());

    const io = req.app.get('io');
    if (io) {
        io.to(`user:${parsedUserId}`).emit('notification', notification);
    }

    return notification;
};

const broadcastNotification = async (req, res) => {
    try {
        const { message, targetRole } = req.body;

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Invalid message' });
        }

        const allowedRoles = new Set(['all', 'students', 'teachers', 'admin']);
        const normalizedRole = String(targetRole || 'all').trim().toLowerCase();
        
        if (!allowedRoles.has(normalizedRole)) {
            return res.status(400).json({ error: 'Invalid targetRole' });
        }

        // Criar notificação de sistema (userId=0)
        const notification = await notificationService.create(0, message.trim());

        const io = req.app.get('io');
        if (io) {
            if (normalizedRole === 'all') {
                io.to('broadcast').emit('notification', notification);
            } else {
                io.to(`broadcast:${normalizedRole}`).emit('notification', notification);
            }
        }

        res.status(201).json(notification);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getAll = async (req, res) => {
    try {
        const previewRequested = String(req.query?.preview || '').trim().toLowerCase() === 'true';
        const notifications = previewRequested
            ? await notificationService.getPreviewByUser(req.session.userId, 5)
            : await notificationService.getAllByUser(req.session.userId);
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getById = async (req, res) => {
    try {
        const notification = await notificationService.getById(req.params.id, req.session.userId);
        if (!notification) return res.status(404).json({ error: 'Not found' });
        res.json(notification);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        await notificationService.markAsRead(req.params.id, req.session.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const remove = async (req, res) => {
    try {
        await notificationService.remove(req.params.id, req.session.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const create = async (req, res) => {
    try {
        const { userId, type, message } = req.body;

        const notification = await sendNotification(req, { userId, type, message });
        res.status(201).json(notification);
        
    } catch (err) {
        const statusCode = err.statusCode || 500;
        res.status(statusCode).json({ error: err.message });
    }
};

module.exports = { getAll, getById, markAsRead, remove, create, sendNotification, broadcastNotification };
