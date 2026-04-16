const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const allowedRoles = new Set(['student', 'teacher', 'admin']);

function toAppRole(roleName) {
  const normalized = String(roleName || '')
    .trim()
    .toLowerCase();

  if (allowedRoles.has(normalized)) {
    return normalized;
  }

  if (normalized.includes('admin')) {
    return 'admin';
  }

  if (normalized.includes('teacher') || normalized.includes('prof')) {
    return 'teacher';
  }

  if (normalized.includes('student') || normalized.includes('aluno')) {
    return 'student';
  }

  return null;
}

function getPrimaryRole(user) {
  const roleNames = (user?.UserRole || [])
    .map((entry) => toAppRole(entry?.Role?.RoleName))
    .filter(Boolean);

  // Priority from highest privilege to lowest.
  const priorityOrder = ['admin', 'teacher', 'student'];
  for (const candidate of priorityOrder) {
    if (roleNames.includes(candidate)) {
      return candidate;
    }
  }

  return 'student';
}

function serializeUser(user, role) {
  return {
    userId: user.UserID,
    authUid: user.AuthUID,
    firstName: user.FirstName,
    lastName: user.LastName,
    email: user.Email,
    role,
    isActive: user.IsActive,
  };
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: { Email: email },
    include: {
      UserRole: {
        include: {
          Role: true,
        },
      },
    },
  });
}

async function findUserById(userId) {
  return prisma.user.findUnique({
    where: { UserID: userId },
    include: {
      UserRole: {
        include: {
          Role: true,
        },
      },
    },
  });
}

async function login(req, res, next) {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    const user = await findUserByEmail(email);

    if (!user || !user.IsActive) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.PasswordHash);

    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await regenerateSession(req);

    const role = getPrimaryRole(user);
    const sessionUser = serializeUser(user, role);

    req.session.userId = user.UserID;
    req.session.role = role;
    req.session.user = sessionUser;

    await saveSession(req);

    res.json({
      user: sessionUser,
      role,
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await findUserById(req.session.userId);

    if (!user || !user.IsActive) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const role = req.session.role || getPrimaryRole(user);
    const sessionUser = serializeUser(user, role);
    req.session.user = sessionUser;

    res.json({
      user: sessionUser,
      role,
    });
  } catch (error) {
    next(error);
  }
}

function logout(req, res, next) {
  if (!req.session) {
    res.status(204).send();
    return;
  }

  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    const cookieName = req.app.get('sessionCookieName');
    const cookieOptions = req.app.get('sessionCookieOptions');

    res.clearCookie(cookieName, cookieOptions);
    res.status(204).send();
  });
}

module.exports = {
  login,
  logout,
  me,
};
