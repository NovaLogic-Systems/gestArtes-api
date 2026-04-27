const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { getPrimaryRoleFromUser } = require('../utils/roles');
const logger = require('../utils/logger');

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function logLoginAttempt(req, details) {
  const level = details.success ? 'info' : 'warn';
  const email = String(details.email || '').trim().toLowerCase();

  logger.log({
    level,
    message: details.success
      ? 'Authentication login succeeded'
      : 'Authentication login failed',
    category: 'security',
    event: 'auth_login_attempt',
    success: details.success,
    email,
    reason: details.reason || null,
    userId: details.userId || null,
    ip: getClientIp(req),
    userAgent: req.get('user-agent') || 'unknown',
  });
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
      logLoginAttempt(req, { success: false, email, reason: 'invalid_user' });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.PasswordHash);

    if (!validPassword) {
      logLoginAttempt(req, {
        success: false,
        email,
        userId: user.UserID,
        reason: 'invalid_password',
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await regenerateSession(req);

    const role = getPrimaryRoleFromUser(user);
    const sessionUser = serializeUser(user, role);

    req.session.userId = user.UserID;
    req.session.role = role;
    req.session.user = sessionUser;
    req.session.cookie.maxAge = req.app.get('sessionCookieOptions')?.maxAge;

    await saveSession(req);

    logLoginAttempt(req, {
      success: true,
      email,
      userId: user.UserID,
      reason: 'authenticated',
    });

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

    const role = req.session.role || getPrimaryRoleFromUser(user);
    const sessionUser = serializeUser(user, role);
    req.session.role = role;
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
  const cookieName = req.app.get('sessionCookieName');
  const cookieOptions = req.app.get('sessionCookieOptions');
  const { maxAge, expires, ...clearCookieOptions } = cookieOptions || {};

  if (!req.session) {
    res.clearCookie(cookieName, clearCookieOptions);
    res.status(204).send();
    return;
  }

  const previousUserId = req.session.userId || null;

  req.session.destroy((error) => {
    res.clearCookie(cookieName, clearCookieOptions);

    if (error) {
      next(error);
      return;
    }

    logger.info('Authentication logout completed', {
      category: 'security',
      event: 'auth_logout',
      userId: previousUserId,
      ip: getClientIp(req),
      userAgent: req.get('user-agent') || 'unknown',
    });

    res.status(204).send();
  });
}

module.exports = {
  login,
  logout,
  me,
};
