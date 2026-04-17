// notification.service.js
const notificationModel = require('../models/notification.model');

const getAllByUser = (userId) => notificationModel.findByUser(userId);
const getById = (id, userId) => notificationModel.findByIdAndUser(id, userId);
const markAsRead = (id, userId) => notificationModel.markRead(id, userId);
const remove = (id, userId) => notificationModel.delete(id, userId);
const create = (userId, message) => notificationModel.insert(userId, message);

module.exports = { getAllByUser, getById, markAsRead, remove, create };

