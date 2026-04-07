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
        const notification = await notificationService.create(userId, message);
        res.status(201).json(notification);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getAll, getById, markAsRead, remove, create };