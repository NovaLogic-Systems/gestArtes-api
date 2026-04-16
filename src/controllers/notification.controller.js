// notification.controller.js
const notificationService = require('../services/notification.service');

const getAll = async (req, res) => {
    try {
        const notifications = await notificationService.getAllByUser(req.session.userId);
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
        const { userId, message } = req.body;
        const parsedUserId = parseInt(userId, 10);

        if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
            return res.status(400).json({ error: 'Invalid userId' });
        }

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Invalid message' });
        }

        const notification = await notificationService.create(parsedUserId, message.trim());
        res.status(201).json(notification);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getAll, getById, markAsRead, remove, create };
