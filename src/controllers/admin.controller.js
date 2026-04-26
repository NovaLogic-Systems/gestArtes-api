const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const adminService = require('../services/admin.service');
const { createSessionWithBusinessRules } = require('../services/session.service');
const { getAdminDashboardSnapshot } = require('../services/adminDashboard.service');
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
        const firstName = String(req.body?.firstName || '').trim();
        const lastName = String(req.body?.lastName || '').trim() || null;
        const email = String(req.body?.email || '').trim().toLowerCase();
        const phoneNumber = String(req.body?.phoneNumber || '').trim() || null;
        const password = String(req.body?.password || '');
        const requestedRole = String(req.body?.role || '').trim();
        const appRole = toAppRole(requestedRole);
        const studentNumber = String(req.body?.studentNumber || '').trim();
        const birthDate = req.body?.birthDate ? new Date(req.body.birthDate) : null;
        const guardianName = String(req.body?.guardianName || '').trim() || null;
        const guardianPhone = String(req.body?.guardianPhone || '').trim() || null;

        if (!appRole) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        if (appRole === 'student' && !(birthDate instanceof Date && !Number.isNaN(birthDate.getTime()))) {
            return res.status(400).json({ error: 'Birth date is required for student users' });
        }

        if (appRole === 'student' && !studentNumber) {
            return res.status(400).json({ error: 'Student number is required for student users' });
        }

        if (appRole !== 'student' && studentNumber) {
            return res.status(400).json({ error: 'Student number is only applicable for student users' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { Email: email },
            select: { UserID: true },
        });

        if (existingUser) {
            return res.status(409).json({ error: 'Email already in use' });
        }

        if (studentNumber) {
            const existingStudentNumber = await prisma.user.findUnique({
                where: { AuthUID: studentNumber },
                select: { UserID: true },
            });

            if (existingStudentNumber) {
                return res.status(409).json({ error: 'Student number already in use' });
            }
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
                    AuthUID: appRole === 'student' ? studentNumber : `local-${crypto.randomUUID()}`,
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
                    StudentAccount: true,
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

        await prisma.user.update({
            where: {
                UserID: targetUserId,
            },
            data: {
                IsActive: false,
                DeletedAt: new Date(),
                UpdatedAt: new Date(),
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
        const adminUserId = toPositiveInteger(req.session?.userId);

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

async function getDashboard(req, res, next) {
    try {
        const dashboard = await getAdminDashboardSnapshot();
        return res.json(dashboard);
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    createUser,
    updateUser,
    deleteUser,
    updateUserRoles,
    finalizeSessionValidation,
    getPostSessionValidations,
    getStudioOccupancy,
    listUsers,
    resetUserPassword,
    createSession,
    getDashboard,
};
