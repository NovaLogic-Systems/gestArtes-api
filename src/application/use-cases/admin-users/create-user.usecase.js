const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { toAppRole } = require('../../../utils/roles');

function resolveRoleRecord(tx, requestedRole) {
  const appRole = toAppRole(requestedRole);

  if (!appRole) {
    return null;
  }

  return tx.role.findMany({
    select: {
      RoleID: true,
      RoleName: true,
    },
    orderBy: {
      RoleID: 'asc',
    },
  }).then((roles) => roles.find((role) => toAppRole(role.RoleName) === appRole) || null);
}

function parseBirthDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function createAdminCreateUserUseCase({ prisma, passwordHashRounds = 12 }) {
  return {
    async execute({ payload }) {
      const firstName = String(payload?.firstName || '').trim();
      const lastName = String(payload?.lastName || '').trim() || null;
      const email = String(payload?.email || '').trim().toLowerCase();
      const phoneNumber = String(payload?.phoneNumber || '').trim() || null;
      const password = String(payload?.password || '');
      const requestedRole = String(payload?.role || '').trim();
      const appRole = toAppRole(requestedRole);
      const studentNumber = String(payload?.studentNumber || '').trim();
      const birthDate = parseBirthDate(payload?.birthDate);
      const guardianName = String(payload?.guardianName || '').trim() || null;
      const guardianPhone = String(payload?.guardianPhone || '').trim() || null;

      if (!appRole) {
        const error = new Error('Invalid role');
        error.status = 400;
        throw error;
      }

      if (appRole === 'student' && !birthDate) {
        const error = new Error('Birth date is required for student users');
        error.status = 400;
        throw error;
      }

      if (appRole === 'student' && !studentNumber) {
        const error = new Error('Student number is required for student users');
        error.status = 400;
        throw error;
      }

      if (appRole !== 'student' && studentNumber) {
        const error = new Error('Student number is only applicable for student users');
        error.status = 400;
        throw error;
      }

      const existingUser = await prisma.user.findUnique({
        where: { Email: email },
        select: { UserID: true },
      });

      if (existingUser) {
        const error = new Error('Email already in use');
        error.status = 409;
        throw error;
      }

      if (studentNumber) {
        const existingStudentNumber = await prisma.user.findUnique({
          where: { AuthUID: studentNumber },
          select: { UserID: true },
        });

        if (existingStudentNumber) {
          const error = new Error('Student number already in use');
          error.status = 409;
          throw error;
        }
      }

      const passwordHash = await bcrypt.hash(password, passwordHashRounds);
      const now = new Date();

      return prisma.$transaction(async (tx) => {
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
    },
  };
}

module.exports = {
  createAdminCreateUserUseCase,
};