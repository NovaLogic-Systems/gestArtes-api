/**
 * @file src/services/notification.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

// notification.service.js
const notificationModel = require('../models/notification.model');

const getAllByUser = (userId) => notificationModel.findByUser(userId);
const getPreviewByUser = (userId, limit) => notificationModel.findPreviewByUser(userId, limit);
const getById = (id, userId) => notificationModel.findByIdAndUser(id, userId);
const markAsRead = (id, userId) => notificationModel.markRead(id, userId);
const remove = (id, userId) => notificationModel.delete(id, userId);
const create = (userId, message) => notificationModel.insert(userId, message);

module.exports = { getAllByUser, getPreviewByUser, getById, markAsRead, remove, create };


