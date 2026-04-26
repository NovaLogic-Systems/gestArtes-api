const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { createSessionWithBusinessRules } = require('../services/session.service');
const {
    ROLE_HIERARCHY,
    ROLE_LABELS,
    getPrimaryRoleFromUser,
    toAppRole,
} = require('../utils/roles');

const MIN_BCRYPT_ROUNDS = 12;
const parsedBcryptRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '', 10);
const BCRYPT_ROUNDS = Number.isInteger(parsedBcryptRounds)
    ? Math.max(parsedBcryptRounds, MIN_BCRYPT_ROUNDS)
    : MIN_BCRYPT_ROUNDS;

function serializeAdminUser(user) {
    const role = getPrimaryRoleFromUser(user);

    return {
        userId: user.UserID,
        firstName: user.FirstName,
        lastName: user.LastName,
        email: user.Email,
        phoneNumber: user.PhoneNumber,
        isActive: Boolean(user.IsActive),
        createdAt: user.CreatedAt,
        role,
        roleLabel: ROLE_LABELS[role] || role,
        roleLevel: ROLE_HIERARCHY[role] || 0,
    };
}

async function resolveRoleRecord(tx, requestedRole) {
    const appRole = toAppRole(requestedRole);

    if (!appRole) {
        return null;
    }

    const roles = await tx.role.findMany({
        select: {
            RoleID: true,
            RoleName: true,
        },
        orderBy: {
            RoleID: 'asc',
        },
    });

    return roles.find((role) => toAppRole(role.RoleName) === appRole) || null;
}

async function listUsers(req, res, next) {
    try {
        const users = await prisma.user.findMany({
            where: {
                DeletedAt: null,
            },
            include: {
                UserRole: {
                    include: {
                        Role: true,
                    },
                },
            },
            orderBy: {
                CreatedAt: 'desc',
            },
        });

        return res.json({
            users: users.map(serializeAdminUser),
        });
    } catch (error) {
        return next(error);
    }
}

async function createUser(req, res, next) {
    try {
        const firstName = String(req.body?.firstName || '').trim();
        const lastName = String(req.body?.lastName || '').trim() || null;
        const email = String(req.body?.email || '').trim().toLowerCase();
        const phoneNumber = String(req.body?.phoneNumber || '').trim() || null;
        const password = String(req.body?.password || '');
        const requestedRole = String(req.body?.role || '').trim();
        const appRole = toAppRole(requestedRole);
        const birthDate = req.body?.birthDate ? new Date(req.body.birthDate) : null;
        const guardianName = String(req.body?.guardianName || '').trim() || null;
        const guardianPhone = String(req.body?.guardianPhone || '').trim() || null;

        if (!appRole) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        if (appRole === 'student' && !(birthDate instanceof Date && !Number.isNaN(birthDate.getTime()))) {
            return res.status(400).json({ error: 'Birth date is required for student users' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { Email: email },
            select: { UserID: true },
        });

        if (existingUser) {
            return res.status(409).json({ error: 'Email already in use' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const now = new Date();

        const createdUser = await prisma.$transaction(async (tx) => {
            const roleRecord = await resolveRoleRecord(tx, appRole);

            if (!roleRecord) {
                const error = new Error('Role not configured');
                error.status = 500;
                throw error;
            }

            const user = await tx.user.create({
                data: {
                    FirstName: firstName,
                    LastName: lastName,
                    Email: email,
                    PhoneNumber: phoneNumber,
                    PasswordHash: passwordHash,
                    AuthUID: `local-${crypto.randomUUID()}`,
                    CreatedAt: now,
                    UpdatedAt: now,
                    IsActive: true,
                },
            });

            await tx.userRole.create({
                data: {
                    UserID: user.UserID,
                    RoleID: roleRecord.RoleID,
                },
            });

            if (appRole === 'student') {
                await tx.studentAccount.create({
                    data: {
                        UserID: user.UserID,
                        BirthDate: birthDate,
                        GuardianName: guardianName,
                        GuardianPhone: guardianPhone,
                    },
                });
            }

            return tx.user.findUnique({
                where: {
                    UserID: user.UserID,
                },
                include: {
                    UserRole: {
                        include: {
                            Role: true,
                        },
                    },
                },
            });
        });

        return res.status(201).json({
            user: serializeAdminUser(createdUser),
        });
    } catch (error) {
        return next(error);
    }
}

async function resetUserPassword(req, res, next) {
    try {
        const targetUserId = Number(req.params.id);
        const newPassword = String(req.body?.newPassword || '');

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        // Encontra o user alvo atraves do ID e verifica se ele existe, esta ativo e nao foi apagado
        const targetUser = await prisma.user.findUnique({
            where: { UserID: targetUserId },
            select: { UserID: true, IsActive: true, DeletedAt: true },
        });

        // protecao contra reset de password de users inativos ou apagados
        if (!targetUser || !targetUser.IsActive || targetUser.DeletedAt) {
            return res.status(404).json({ error: 'User not found' });
        }

        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        await prisma.user.update({
            where: { UserID: targetUserId },
            data: {
                PasswordHash: passwordHash,
                UpdatedAt: new Date(),
            },
        });

        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
}

async function createSession(req, res, next) {
    try {
        const requestedByUserId = Number(req.session?.userId);
        if (!Number.isInteger(requestedByUserId) || requestedByUserId <= 0) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const result = await createSessionWithBusinessRules(req.body, requestedByUserId);

        return res.status(201).json({
            sessionId: result.SessionID,
            message: 'Sessão criada com sucesso',
        });
    } catch (error) {
        if (error && error.status) {
            return res.status(error.status).json({
                error: error.message,
                details: error.details || null,
            });
        }

        return next(error);
    }
}

module.exports = {
    createUser,
    listUsers,
    resetUserPassword,
    createSession,
};
