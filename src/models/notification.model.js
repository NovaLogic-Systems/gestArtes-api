const prisma = require('../config/prisma');

const DEFAULT_NOTIFICATION_TYPE_ID = 1;

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

const mapNotification = (row) => ({
    id: row.NotificationID,
    userId: row.UserID,
    message: row.Message,
    typeId: row.TypeID,
    isRead: row.IsRead,
    createdAt: row.CreatedAt,
    title: row.Title,
    sessionId: row.SessionID,
});

const findByUser = async (userId) => {
    const rows = await prisma.notification.findMany({
        where: { UserID: toInt(userId, 'userId') },
        orderBy: { CreatedAt: 'desc' },
    });

    return rows.map(mapNotification);
};

const findPreviewByUser = async (userId, limit = 5) => {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

    const rows = await prisma.notification.findMany({
        where: { UserID: toInt(userId, 'userId') },
        orderBy: { CreatedAt: 'desc' },
        take: safeLimit,
    });

    return rows.map(mapNotification);
};

const findByIdAndUser = async (id, userId) => {
    const row = await prisma.notification.findFirst({
        where: {
            NotificationID: toInt(id, 'id'),
            UserID: toInt(userId, 'userId'),
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

const insert = async (userId, message) => {
    const row = await prisma.notification.create({
        data: {
            UserID: toInt(userId, 'userId'),
            Message: message,
            TypeID: DEFAULT_NOTIFICATION_TYPE_ID,
            IsRead: false,
            CreatedAt: new Date(),
            Title: buildDefaultTitle(message),
        },
    });

    return mapNotification(row);
};

module.exports = { findByUser, findPreviewByUser, findByIdAndUser, markRead, delete: deleteNotif, insert };