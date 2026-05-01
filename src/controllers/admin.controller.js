/**
 * @file src/controllers/admin.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const adminService = require('../services/admin.service');
const { createSessionWithBusinessRules } = require('../services/session.service');
const { getAdminDashboardSnapshot } = require('../services/adminDashboard.service');
const { sendNotification } = require('./notification.controller');
const { createAdminSessionUseCases } = require('../application/use-cases/admin-sessions');
const { createAdminUserUseCases } = require('../application/use-cases/admin-users');
const { logAudit, AUDIT_ACTIONS, AUDIT_MODULES } = require('../utils/audit');
const {
    ROLE_HIERARCHY,
    ROLE_LABELS,
    getPrimaryRoleFromUser,
    toAppRole,
} = require('../utils/roles');

const PASSWORD_HASH_ROUNDS = 12;
const SESSION_APPROVAL_NOTIFICATION_TYPE = 'schedule';

const adminSessionUseCases = createAdminSessionUseCases({ prisma });
const adminUserUseCases = createAdminUserUseCases({ prisma, passwordHashRounds: PASSWORD_HASH_ROUNDS });

function serializeAdminUser(user) {
    const role = getPrimaryRoleFromUser(user);
    const appRoles = Array.from(new Set((user.UserRole || [])
        .map((entry) => toAppRole(entry?.Role?.RoleName))
        .filter(Boolean)));
    const isStudent = appRoles.includes('student');

    return {
        userId: user.UserID,
        firstName: user.FirstName,
        lastName: user.LastName,
        email: user.Email,
        phoneNumber: user.PhoneNumber,
        isActive: Boolean(user.IsActive),
        createdAt: user.CreatedAt,
        role,
        roles: appRoles,
        roleLabel: ROLE_LABELS[role] || role,
        roleLevel: ROLE_HIERARCHY[role] || 0,
        studentNumber: isStudent ? user.AuthUID : null,
        birthDate: user.StudentAccount?.BirthDate || null,
        guardianName: user.StudentAccount?.GuardianName || null,
        guardianPhone: user.StudentAccount?.GuardianPhone || null,
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

async function resolveRoleRecords(tx, requestedRoles) {
    const appRoles = Array.from(new Set(
        (Array.isArray(requestedRoles) ? requestedRoles : [requestedRoles])
            .map(toAppRole)
            .filter(Boolean)
    ));

    const roles = await tx.role.findMany({
        select: {
            RoleID: true,
            RoleName: true,
        },
        orderBy: {
            RoleID: 'asc',
        },
    });

    const roleByAppRole = new Map();
    for (const role of roles) {
        const appRole = toAppRole(role.RoleName);
        if (appRole && !roleByAppRole.has(appRole)) {
            roleByAppRole.set(appRole, role);
        }
    }

    return appRoles
        .map((appRole) => roleByAppRole.get(appRole))
        .filter(Boolean);
}

function parseTargetUserId(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getManagedUser(tx, targetUserId) {
    return tx.user.findUnique({
        where: {
            UserID: targetUserId,
        },
        include: {
            UserRole: {
                include: {
                    Role: true,
                },
            },
            StudentAccount: true,
        },
    });
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
                StudentAccount: true,
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
        const createdUser = await adminUserUseCases.createUser.execute({
            payload: req.body,
        });

        return res.status(201).json({
            user: serializeAdminUser(createdUser),
        });
    } catch (error) {
        if (error && Number.isInteger(error.status)) {
            return res.status(error.status).json({ error: error.message });
        }

        return next(error);
    }
}

async function updateUser(req, res, next) {
    try {
        const targetUserId = parseTargetUserId(req.params.id);

        if (!targetUserId) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const firstName = typeof req.body?.firstName === 'string' ? String(req.body.firstName).trim() : undefined;
        const lastName = typeof req.body?.lastName === 'string' ? String(req.body.lastName).trim() : undefined;
        const email = typeof req.body?.email === 'string' ? String(req.body.email).trim().toLowerCase() : undefined;
        const phoneNumber = typeof req.body?.phoneNumber === 'string' ? String(req.body.phoneNumber).trim() : undefined;
        const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined;
        const studentNumber = typeof req.body?.studentNumber === 'string' ? String(req.body.studentNumber).trim() : undefined;
        const birthDate = req.body?.birthDate ? new Date(req.body.birthDate) : undefined;
        const guardianName = typeof req.body?.guardianName === 'string' ? String(req.body.guardianName).trim() : undefined;
        const guardianPhone = typeof req.body?.guardianPhone === 'string' ? String(req.body.guardianPhone).trim() : undefined;

        const updatedUser = await prisma.$transaction(async (tx) => {
            const targetUser = await getManagedUser(tx, targetUserId);

            if (!targetUser || targetUser.DeletedAt) {
                return null;
            }

            const isStudent = (targetUser.UserRole || [])
                .map((entry) => toAppRole(entry?.Role?.RoleName))
                .includes('student');

            if (email && email !== targetUser.Email) {
                const existingUser = await tx.user.findUnique({
                    where: { Email: email },
                    select: { UserID: true },
                });

                if (existingUser && existingUser.UserID !== targetUserId) {
                    const conflictError = new Error('Email already in use');
                    conflictError.status = 409;
                    throw conflictError;
                }
            }

            if (typeof studentNumber === 'string') {
                if (!isStudent) {
                    const error = new Error('Student number is only applicable for student users');
                    error.status = 400;
                    throw error;
                }

                const existingStudentNumber = await tx.user.findUnique({
                    where: { AuthUID: studentNumber },
                    select: { UserID: true },
                });

                if (existingStudentNumber && existingStudentNumber.UserID !== targetUserId) {
                    const conflictError = new Error('Student number already in use');
                    conflictError.status = 409;
                    throw conflictError;
                }
            }

            const userUpdateData = {
                UpdatedAt: new Date(),
            };

            if (typeof firstName === 'string') {
                userUpdateData.FirstName = firstName;
            }

            if (typeof lastName === 'string') {
                userUpdateData.LastName = lastName || null;
            }

            if (typeof email === 'string') {
                userUpdateData.Email = email;
            }

            if (typeof phoneNumber === 'string') {
                userUpdateData.PhoneNumber = phoneNumber || null;
            }

            if (typeof isActive === 'boolean') {
                userUpdateData.IsActive = isActive;
            }

            if (typeof studentNumber === 'string' && studentNumber) {
                userUpdateData.AuthUID = studentNumber;
            }

            await tx.user.update({
                where: { UserID: targetUserId },
                data: userUpdateData,
            });

            const hasStudentPayload = [birthDate, guardianName, guardianPhone]
                .some((entry) => entry !== undefined);

            if (hasStudentPayload) {
                if (!targetUser.StudentAccount) {
                    const error = new Error('Student profile fields are only applicable for student users');
                    error.status = 400;
                    throw error;
                }

                const studentData = {};

                if (birthDate !== undefined) {
                    studentData.BirthDate = birthDate;
                }

                if (guardianName !== undefined) {
                    studentData.GuardianName = guardianName || null;
                }

                if (guardianPhone !== undefined) {
                    studentData.GuardianPhone = guardianPhone || null;
                }

                await tx.studentAccount.update({
                    where: {
                        UserID: targetUserId,
                    },
                    data: studentData,
                });
            }

            return getManagedUser(tx, targetUserId);
        });

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({
            user: serializeAdminUser(updatedUser),
        });
    } catch (error) {
        if (error?.status) {
            return res.status(error.status).json({ error: error.message });
        }

        return next(error);
    }
}

async function deleteUser(req, res, next) {
    try {
        const targetUserId = parseTargetUserId(req.params.id);

        if (!targetUserId) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { UserID: targetUserId },
            select: {
                UserID: true,
                DeletedAt: true,
            },
        });

        if (!existingUser || existingUser.DeletedAt) {
            return res.status(404).json({ error: 'User not found' });
        }

        const deletionToken = crypto.randomUUID();
        const deletedAt = new Date();
        const passwordHash = await bcrypt.hash(crypto.randomUUID(), PASSWORD_HASH_ROUNDS);

        await prisma.user.update({
            where: {
                UserID: targetUserId,
            },
            data: {
                FirstName: 'Deleted',
                LastName: null,
                PhoneNumber: null,
                Photo: null,
                Email: `deleted+${targetUserId}-${deletionToken}@gestartes.local`,
                AuthUID: `deleted-${targetUserId}-${deletionToken}`,
                PasswordHash: passwordHash,
                IsActive: false,
                DeletedAt: deletedAt,
                UpdatedAt: deletedAt,
            },
        });

        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
}

async function updateUserRoles(req, res, next) {
    try {
        const targetUserId = parseTargetUserId(req.params.id);
        const requestedRoles = Array.isArray(req.body?.roles)
            ? req.body.roles
            : [req.body?.role];
        const appRoles = Array.from(new Set(requestedRoles.map(toAppRole).filter(Boolean)));
        const studentNumber = String(req.body?.studentNumber || '').trim();
        const birthDate = req.body?.birthDate ? new Date(req.body.birthDate) : null;
        const guardianName = String(req.body?.guardianName || '').trim() || null;
        const guardianPhone = String(req.body?.guardianPhone || '').trim() || null;

        if (!targetUserId) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        if (!appRoles.length) {
            return res.status(400).json({ error: 'Invalid roles' });
        }

        const updatedUser = await prisma.$transaction(async (tx) => {
            const targetUser = await getManagedUser(tx, targetUserId);

            if (!targetUser || targetUser.DeletedAt) {
                return null;
            }

            const roleRecords = await resolveRoleRecords(tx, appRoles);
            if (!roleRecords.length || roleRecords.length !== appRoles.length) {
                const error = new Error('Role not configured');
                error.status = 500;
                throw error;
            }

            const willBeStudent = appRoles.includes('student');
            const hasStudentAccount = Boolean(targetUser.StudentAccount);

            if (willBeStudent && !hasStudentAccount) {
                if (!(birthDate instanceof Date && !Number.isNaN(birthDate.getTime()))) {
                    const error = new Error('Birth date is required when assigning student role');
                    error.status = 400;
                    throw error;
                }

                if (!studentNumber) {
                    const error = new Error('Student number is required when assigning student role');
                    error.status = 400;
                    throw error;
                }

                const existingStudentNumber = await tx.user.findUnique({
                    where: { AuthUID: studentNumber },
                    select: { UserID: true },
                });

                if (existingStudentNumber && existingStudentNumber.UserID !== targetUserId) {
                    const conflictError = new Error('Student number already in use');
                    conflictError.status = 409;
                    throw conflictError;
                }
            }

            if (!willBeStudent && studentNumber) {
                const error = new Error('Student number is only applicable for student users');
                error.status = 400;
                throw error;
            }

            await tx.userRole.deleteMany({
                where: {
                    UserID: targetUserId,
                },
            });

            await tx.userRole.createMany({
                data: roleRecords.map((role) => ({
                    UserID: targetUserId,
                    RoleID: role.RoleID,
                })),
            });

            if (willBeStudent && !hasStudentAccount) {
                await tx.studentAccount.create({
                    data: {
                        UserID: targetUserId,
                        BirthDate: birthDate,
                        GuardianName: guardianName,
                        GuardianPhone: guardianPhone,
                    },
                });

                await tx.user.update({
                    where: { UserID: targetUserId },
                    data: {
                        AuthUID: studentNumber,
                        UpdatedAt: new Date(),
                    },
                });
            }

            if (willBeStudent && hasStudentAccount) {
                if (studentNumber) {
                    const existingStudentNumber = await tx.user.findUnique({
                        where: { AuthUID: studentNumber },
                        select: { UserID: true },
                    });

                    if (existingStudentNumber && existingStudentNumber.UserID !== targetUserId) {
                        const conflictError = new Error('Student number already in use');
                        conflictError.status = 409;
                        throw conflictError;
                    }

                    await tx.user.update({
                        where: { UserID: targetUserId },
                        data: {
                            AuthUID: studentNumber,
                            UpdatedAt: new Date(),
                        },
                    });
                }

                const hasStudentProfilePatch = ['birthDate', 'guardianName', 'guardianPhone']
                    .some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));

                if (hasStudentProfilePatch) {
                    await tx.studentAccount.update({
                        where: {
                            UserID: targetUserId,
                        },
                        data: {
                            ...(birthDate ? { BirthDate: birthDate } : {}),
                            ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'guardianName')
                                ? { GuardianName: guardianName }
                                : {}),
                            ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'guardianPhone')
                                ? { GuardianPhone: guardianPhone }
                                : {}),
                        },
                    });
                }
            }

            return getManagedUser(tx, targetUserId);
        });

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.json({
            user: serializeAdminUser(updatedUser),
        });
    } catch (error) {
        if (error?.status) {
            return res.status(error.status).json({ error: error.message });
        }

        return next(error);
    }
}

async function resetUserPassword(req, res, next) {
    try {
        const targetUserId = Number(req.params.id);
        const adminUserId = Number(req.auth?.userId);
        const newPassword = String(req.body?.newPassword || '');

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        if (!Number.isInteger(adminUserId) || adminUserId <= 0) {
            return res.status(401).json({ error: 'Not authenticated' });
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

        const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);

        await prisma.user.update({
            where: { UserID: targetUserId },
            data: {
                PasswordHash: passwordHash,
                UpdatedAt: new Date(),
            },
        });

        logAudit({
            userId: adminUserId,
            action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
            module: AUDIT_MODULES.USERS,
            targetType: 'user',
            targetId: targetUserId,
        });

        return res.status(200).json({ message: 'Password reset successfully.' });
    } catch (error) {
        return next(error);
    }
}

function toPositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getPostSessionValidations(req, res, next) {
    try {
        const sessions = await adminService.listPostSessionValidationQueue();

        return res.json({
            sessions,
        });
    } catch (error) {
        return next(error);
    }
}

async function finalizeSessionValidation(req, res, next) {
    try {
        const sessionId = toPositiveInteger(req.params.id);
        const adminUserId = toPositiveInteger(req.auth?.userId);

        if (!sessionId) {
            return res.status(400).json({ error: 'Invalid session id' });
        }

        if (!adminUserId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const result = await adminService.finalizeSessionValidation({
            sessionId,
            adminUserId,
        });

        return res.json(result);
    } catch (error) {
        return next(error);
    }
}

async function getStudioOccupancy(req, res, next) {
    try {
        const occupancy = await adminService.getStudioOccupancy({
            from: req.query.from,
            to: req.query.to,
        });

        return res.json(occupancy);
    } catch (error) {
        return next(error);
    }
}

async function createSession(req, res, next) {
    try {
        const requestedByUserId = Number(req.auth?.userId);
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

async function getDashboard(req, res, next) {
    try {
        const dashboard = await getAdminDashboardSnapshot();
        return res.json(dashboard);
    } catch (error) {
        return next(error);
    }
}

function toUTCDateStr(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
}

function toUTCTimeStr(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(11, 16);
}

async function resolveOrCreateSessionStatus(tx, statusName) {
    const existing = await tx.sessionStatus.findFirst({ where: { StatusName: { contains: statusName } } });
    if (existing) return existing.StatusID;
    const created = await tx.sessionStatus.create({ data: { StatusName: statusName } });
    return created.StatusID;
}

async function listPendingApproval(req, res, next) {
    try {
        const allStatuses = await prisma.sessionStatus.findMany({
            select: { StatusID: true, StatusName: true },
        });

        const pendingStatusIds = allStatuses
            .filter((s) => s.StatusName.toLowerCase().includes('pending'))
            .map((s) => s.StatusID);

        if (!pendingStatusIds.length) {
            return res.json({ sessions: [] });
        }

        const sessions = await prisma.coachingSession.findMany({
            where: { StatusID: { in: pendingStatusIds } },
            include: {
                SessionStatus: { select: { StatusName: true } },
                Studio: { select: { StudioName: true } },
                Modality: { select: { ModalityName: true } },
                SessionPricingRate: { select: { HourlyRate: true } },
                User_CoachingSession_RequestedByUserIDToUser: {
                    select: { FirstName: true, LastName: true, Email: true },
                },
                SessionTeacher: {
                    include: {
                        User: { select: { FirstName: true, LastName: true } },
                    },
                },
                _count: { select: { SessionStudent: true } },
            },
            orderBy: [{ CreatedAt: 'asc' }],
        });

        const result = sessions.map((s) => {
            const teacher = s.SessionTeacher[0]?.User;
            const requester = s.User_CoachingSession_RequestedByUserIDToUser;
            return {
                sessionId: s.SessionID,
                date: toUTCDateStr(s.StartTime),
                startTime: toUTCTimeStr(s.StartTime),
                endTime: toUTCTimeStr(s.EndTime),
                studioName: s.Studio.StudioName,
                modalityName: s.Modality.ModalityName,
                status: s.SessionStatus.StatusName,
                teacherName: teacher ? `${teacher.FirstName} ${teacher.LastName || ''}`.trim() : '—',
                requesterName: requester ? `${requester.FirstName} ${requester.LastName || ''}`.trim() : '—',
                requesterEmail: requester?.Email || null,
                enrolledCount: s._count.SessionStudent,
                maxParticipants: s.MaxParticipants,
                hourlyRate: Number(s.SessionPricingRate.HourlyRate),
                createdAt: s.CreatedAt,
            };
        });

        return res.json({ sessions: result, total: result.length });
    } catch (error) {
        return next(error);
    }
}

async function approveSession(req, res, next) {
    try {
        const sessionId = toPositiveInteger(req.params.id);
        const adminUserId = toPositiveInteger(req.auth?.userId);

        if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });
        if (!adminUserId) return res.status(401).json({ error: 'Not authenticated' });

        const { statusId, userIdsToNotify } = await adminSessionUseCases.approveSession.execute({
            adminUserId,
            payload: { sessionId },
        });

        await Promise.allSettled(
            userIdsToNotify.map((userId) =>
                sendNotification(req, {
                    userId,
                    type: SESSION_APPROVAL_NOTIFICATION_TYPE,
                    message: `A sessão #${sessionId} foi aprovada pela gestão.`,
                }),
            ),
        );

        return res.json({ sessionId, statusId });
    } catch (error) {
        return next(error);
    }
}

async function rejectSession(req, res, next) {
    try {
        const sessionId = toPositiveInteger(req.params.id);
        const adminUserId = toPositiveInteger(req.auth?.userId);
        const reviewNotes = String(req.body?.reason || req.body?.reviewNotes || '').trim();

        if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });
        if (!adminUserId) return res.status(401).json({ error: 'Not authenticated' });
        if (!reviewNotes) return res.status(400).json({ error: 'Reason is required when rejecting a session' });

        const { userIdsToNotify } = await adminSessionUseCases.rejectSession.execute({
            adminUserId,
            payload: { sessionId, reviewNotes },
        });

        await Promise.allSettled(
            userIdsToNotify.map((userId) =>
                sendNotification(req, {
                    userId,
                    type: SESSION_APPROVAL_NOTIFICATION_TYPE,
                    message: `A sessão #${sessionId} foi rejeitada pela gestão. Motivo: ${reviewNotes.slice(0, 100)}`.slice(0, 255),
                }),
            ),
        );

        return res.json({ sessionId });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    approveSession,
    createUser,
    updateUser,
    deleteUser,
    updateUserRoles,
    finalizeSessionValidation,
    getPostSessionValidations,
    getStudioOccupancy,
    listPendingApproval,
    listUsers,
    rejectSession,
    resetUserPassword,
    createSession,
    getDashboard,
};

