const notificationModel = require('../models/notification.model');

const getAllByUser = (UserID) => notificationModel.findByUser(UserID);
const getById = (id, UserID) => notificationModel.findByIdAndUser(id, UserID);
const markAsRead = (id, UserID) => notificationModel.markRead(id, UserID);
const remove = (id, UserID) => notificationModel.delete(id, UserID);

// Chamado por BE-10, BE-11, BE-12 — nunca diretamente pelo browser
const create = (UserID, message) => notificationModel.insert(UserID, message);

module.exports = { getAllByUser, getById, markAsRead, remove, create };