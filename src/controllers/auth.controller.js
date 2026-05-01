/**
 * @file src/controllers/auth.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const { getPrimaryRoleFromUser } = require('../utils/roles');
const logger = require('../utils/logger');
const {
  issueAuthTokens,
  rotateRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  verifyAccessToken,
  getAuthCookieDefaults,
  getAccessTokenTtlMs,
  getRefreshTokenTtlMs,
} = require('../services/jwt.service');
const {
  getAuthenticatedRole,
  getAuthenticatedUserId,
} = require('../utils/auth-context');

const REFRESH_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME || 'gestartes.refresh_token';

function getClientIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];

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

function extractBearerToken(req) {
  const authorization = req.get?.('authorization') || req.headers?.authorization || '';
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return match[1].trim() || null;
}

function getRefreshCookieName(req) {
  return req.app?.get?.('refreshCookieName') || REFRESH_COOKIE_NAME;
}

function getRefreshCookieOptions(req) {
  const appOptions = req.app?.get?.('refreshCookieOptions') || {};
  return {
    ...getAuthCookieDefaults(),
    ...appOptions,
  };
}

function setRefreshCookie(req, res, token, expiresAt) {
  if (typeof res.cookie !== 'function') {
    return;
  }

  res.cookie(getRefreshCookieName(req), token, {
    ...getRefreshCookieOptions(req),
    maxAge: expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : getRefreshTokenTtlMs(),
  });
}

function clearRefreshCookie(req, res) {
  if (typeof res.clearCookie !== 'function') {
    return;
  }

  const { maxAge, expires, ...cookieOptions } = getRefreshCookieOptions(req);
  res.clearCookie(getRefreshCookieName(req), cookieOptions);
}

function getRefreshTokenFromRequest(req) {
  const cookieHeader = req.get?.('cookie') || req.headers?.cookie || '';
  const cookieName = getRefreshCookieName(req);

  if (!cookieHeader) {
    return null;
  }

  const entries = cookieHeader.split(';');

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const key = entry.slice(0, separatorIndex).trim();

    if (key !== cookieName) {
      continue;
    }

    return decodeURIComponent(entry.slice(separatorIndex + 1).trim());
  }

  return null;
}

function getRequestUserId(req) {
  return getAuthenticatedUserId(req);
}

async function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: { Email: email },
    select: {
      UserID: true,
      AuthUID: true,
      FirstName: true,
      LastName: true,
      Email: true,
      IsActive: true,
      PasswordHash: true,
      UserRole: {
        select: {
          Role: true,
        },
      },
    },
  });
}

async function findUserById(userId) {
  return prisma.user.findUnique({
    where: { UserID: userId },
    select: {
      UserID: true,
      AuthUID: true,
      FirstName: true,
      LastName: true,
      Email: true,
      IsActive: true,
      UserRole: {
        select: {
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

    const role = getPrimaryRoleFromUser(user);
    const sessionUser = serializeUser(user, role);

    const tokens = await issueAuthTokens({
      user,
      role,
      ip: getClientIp(req),
      userAgent: req.get('user-agent') || 'unknown',
    });

    setRefreshCookie(req, res, tokens.refreshToken, tokens.refreshTokenExpiresAt);

    logLoginAttempt(req, {
      success: true,
      email,
      userId: user.UserID,
      reason: 'authenticated',
    });

    res.json({
      user: sessionUser,
      role,
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: getAccessTokenTtlMs(),
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const userId = getRequestUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await findUserById(userId);

    if (!user || !user.IsActive) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const role = getAuthenticatedRole(req) || getPrimaryRoleFromUser(user);
    const sessionUser = serializeUser(user, role);

    req.auth = req.auth || { userId, role };
    req.user = req.user || { userId, role, roles: role ? [role] : [] };

    res.json({
      user: sessionUser,
      role,
    });
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const rotated = await rotateRefreshToken(refreshToken, {
      ip: getClientIp(req),
      userAgent: req.get('user-agent') || 'unknown',
      role: getAuthenticatedRole(req),
    });

    if (!rotated) {
      clearRefreshCookie(req, res);
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const sessionUser = serializeUser(rotated.user, rotated.role);

    setRefreshCookie(req, res, rotated.refreshToken, rotated.refreshTokenExpiresAt);

    res.json({
      user: sessionUser,
      role: rotated.role,
      accessToken: rotated.accessToken,
      tokenType: 'Bearer',
      expiresIn: getAccessTokenTtlMs(),
    });
  } catch (error) {
    clearRefreshCookie(req, res);
    res.status(401).json({ error: 'Not authenticated' });
  }
}

function logout(req, res, next) {
  const refreshToken = getRefreshTokenFromRequest(req);
  const accessToken = extractBearerToken(req);

  let previousUserId = getRequestUserId(req) || null;

  if (!previousUserId && accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      const parsedUserId = Number(payload?.userId || payload?.sub);
      if (Number.isInteger(parsedUserId) && parsedUserId > 0) {
        previousUserId = parsedUserId;
      }
    } catch {
      // Ignore invalid/expired access token for logout idempotency.
    }
  }

  if (refreshToken) {
    revokeRefreshToken(refreshToken).catch(() => {});
  }

  clearRefreshCookie(req, res);

  logger.info('Authentication logout completed', {
    category: 'security',
    event: 'auth_logout',
    userId: previousUserId,
    ip: getClientIp(req),
    userAgent: req.get?.('user-agent') || 'unknown',
  });

  res.status(204).send();
}

async function logoutAll(req, res, next) {
  try {
    const userId = getRequestUserId(req);

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await revokeAllRefreshTokensForUser(userId);

    clearRefreshCookie(req, res);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  logoutAll,
  me,
};

