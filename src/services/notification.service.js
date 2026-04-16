const notificationModel = require('../models/notification.model');

const getAllByUser = (userId) => notificationModel.findByUser(userId);
const getById = (id, userId) => notificationModel.findByIdAndUser(id, userId);
const markAsRead = (id, userId) => notificationModel.markRead(id, userId);
const remove = (id, userId) => notificationModel.delete(id, userId);

// Chamado por BE-10, BE-11, BE-12 — nunca diretamente pelo browser
const create = (userId, message) => notificationModel.insert(userId, message);

module.exports = { getAllByUser, getById, markAsRead, remove, create };
