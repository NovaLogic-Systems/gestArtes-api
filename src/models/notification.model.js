/**
 * @file src/models/notification.model.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');

const DEFAULT_NOTIFICATION_TYPE_ID = 1;
const DEFAULT_NOTIFICATION_TYPE_NAME = 'system';

const toInt = (value, fieldName) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return parsed;
};

const buildDefaultTitle = (message) => {
    if (!message) return 'Nova notificacao';
    const trimmed = String(message).trim();
    if (!trimmed) return 'Nova notificacao';
    return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
};

const resolveNotificationTypeId = async (type) => {
    const normalizedType = String(type || DEFAULT_NOTIFICATION_TYPE_NAME).trim().toLowerCase();

    const notificationType = await prisma.notificationType.findUnique({
        where: { TypeName: normalizedType },
        select: { TypeID: true },
    });

    if (notificationType) {
        return notificationType.TypeID;
    }

    if (normalizedType !== DEFAULT_NOTIFICATION_TYPE_NAME) {
        const fallbackType = await prisma.notificationType.findUnique({
            where: { TypeName: DEFAULT_NOTIFICATION_TYPE_NAME },
            select: { TypeID: true },
        });

        if (fallbackType) {
            return fallbackType.TypeID;
        }
    }

    return DEFAULT_NOTIFICATION_TYPE_ID;
};

const mapNotification = (row) => ({
    id: row.NotificationID,
    userId: row.UserID,
    message: row.Message,
    typeId: row.TypeID,
    type: String(row.NotificationType?.TypeName || '').trim().toLowerCase() || null,
    isRead: row.IsRead,
    createdAt: row.CreatedAt,
    title: row.Title,
    sessionId: row.SessionID,
});

const findByUser = async (userId) => {
    const rows = await prisma.notification.findMany({
        where: { UserID: toInt(userId, 'userId') },
        orderBy: { CreatedAt: 'desc' },
        include: {
            NotificationType: {
                select: { TypeName: true },
            },
        },
    });

    return rows.map(mapNotification);
};

const findPreviewByUser = async (userId, limit = 5) => {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

    const rows = await prisma.notification.findMany({
        where: { UserID: toInt(userId, 'userId') },
        orderBy: { CreatedAt: 'desc' },
        take: safeLimit,
        include: {
            NotificationType: {
                select: { TypeName: true },
            },
        },
    });

    return rows.map(mapNotification);
};

const findByIdAndUser = async (id, userId) => {
    const row = await prisma.notification.findFirst({
        where: {
            NotificationID: toInt(id, 'id'),
            UserID: toInt(userId, 'userId'),
        },
        include: {
            NotificationType: {
                select: { TypeName: true },
            },
        },
    });

    return row ? mapNotification(row) : null;
};

const markRead = async (id, userId) => {
    await prisma.notification.updateMany({
        where: {
            NotificationID: toInt(id, 'id'),
            UserID: toInt(userId, 'userId'),
        },
        data: { IsRead: true },
    });
};

const deleteNotif = async (id, userId) => {
    await prisma.notification.deleteMany({
        where: {
            NotificationID: toInt(id, 'id'),
            UserID: toInt(userId, 'userId'),
        },
    });
};

const insert = async (userId, message, title, type) => {
    const normalizedTitle = typeof title === 'string' && title.trim()
        ? title.trim()
        : buildDefaultTitle(message);
    const typeId = await resolveNotificationTypeId(type);

    const row = await prisma.notification.create({
        data: {
            UserID: toInt(userId, 'userId'),
            Message: message,
            TypeID: typeId,
            IsRead: false,
            CreatedAt: new Date(),
            Title: normalizedTitle.length > 255 ? normalizedTitle.slice(0, 255) : normalizedTitle,
        },
        include: {
            NotificationType: {
                select: { TypeName: true },
            },
        },
    });

    return mapNotification(row);
};

module.exports = { findByUser, findPreviewByUser, findByIdAndUser, markRead, delete: deleteNotif, insert };
