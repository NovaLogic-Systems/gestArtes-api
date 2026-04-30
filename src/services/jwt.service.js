const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { toAppRole } = require('../utils/roles');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRY || process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_EXPIRY || process.env.JWT_REFRESH_TTL || '7d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'gestArtes-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'gestArtes-web';
const JWT_CLOCK_TOLERANCE_SECONDS = Math.floor(
  parseTokenTtl(process.env.JWT_CLOCK_TOLERANCE || '0s') / 1000
);
const ACCESS_TOKEN_SECRET = resolveJwtSecret(
  'JWT_ACCESS_SECRET',
  'gestartes-dev-access-secret'
);
const REFRESH_TOKEN_SECRET = resolveJwtSecret(
  'JWT_REFRESH_SECRET',
  'gestartes-dev-refresh-secret'
);

function resolveJwtSecret(envName, developmentFallback) {
  const configuredSecret = String(process.env[envName] || '').trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (IS_PRODUCTION) {
    throw new Error(`${envName} is required in production`);
  }

  return developmentFallback;
}

function normalizeRoleClaim(role) {
  return toAppRole(role);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function parseTokenTtl(ttl) {
  if (typeof ttl === 'number') {
    return ttl;
  }

  const normalized = String(ttl || '').trim();
  if (!normalized) {
    return 0;
  }

  const match = normalized.match(/^(\d+)([smhd])$/i);
  if (!match) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] || 0);
}

function createAccessTokenPayload(user, role) {
  const normalizedRole = normalizeRoleClaim(role);

  return {
    sub: String(user.UserID),
    userId: user.UserID,
    authUid: user.AuthUID,
    email: user.Email,
    firstName: user.FirstName,
    lastName: user.LastName,
    role: normalizedRole,
    roles: normalizedRole ? [normalizedRole] : [],
    tokenType: 'access',
  };
}

function createRefreshTokenPayload(userId, jti) {
  return {
    sub: String(userId),
    userId,
    jti,
    tokenType: 'refresh',
  };
}

function signAccessToken(user, role) {
  return jwt.sign(createAccessTokenPayload(user, role), ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: crypto.randomUUID(),
  });
}

function signRefreshToken(userId) {
  const jti = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign(createRefreshTokenPayload(userId, jti), REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  const decoded = jwt.decode(token);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

  return {
    token,
    jti,
    expiresAt,
  };
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, ACCESS_TOKEN_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
  });

  if (payload?.tokenType && payload.tokenType !== 'access') {
    throw new Error('Invalid access token');
  }

  return payload;
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, REFRESH_TOKEN_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
  });

  if (payload?.tokenType && payload.tokenType !== 'refresh') {
    throw new Error('Invalid refresh token');
  }

  return payload;
}

async function persistRefreshToken({ userId, token, jti, expiresAt, ip, userAgent }) {
  if (!expiresAt) {
    throw new Error('Refresh token expiry not available');
  }

  if (!prisma.refreshToken || typeof prisma.refreshToken.create !== 'function') {
    return null;
  }

  return prisma.refreshToken.create({
    data: {
      UserID: userId,
      TokenJti: jti,
      TokenHash: hashToken(token),
      CreatedAt: new Date(),
      ExpiresAt: expiresAt,
      CreatedByIp: ip || null,
      CreatedByUserAgent: userAgent || null,
    },
  });
}

async function issueAuthTokens({ user, role, ip, userAgent }) {
  const accessToken = signAccessToken(user, role);
  const refreshToken = signRefreshToken(user.UserID);

  await persistRefreshToken({
    userId: user.UserID,
    token: refreshToken.token,
    jti: refreshToken.jti,
    expiresAt: refreshToken.expiresAt,
    ip,
    userAgent,
  });

  return {
    accessToken,
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt,
  };
}

async function findActiveRefreshToken(token) {
  if (!prisma.refreshToken || typeof prisma.refreshToken.findFirst !== 'function') {
    return null;
  }

  const payload = verifyRefreshToken(token);
  const tokenHash = hashToken(token);

  const refreshToken = await prisma.refreshToken.findFirst({
    where: {
      TokenJti: payload.jti,
      TokenHash: tokenHash,
      RevokedAt: null,
      ExpiresAt: {
        gt: new Date(),
      },
    },
    include: {
      User: {
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
      },
    },
  });

  if (!refreshToken) {
    return null;
  }

  return refreshToken;
}

async function rotateRefreshToken(existingToken, metadata = {}) {
  const current = await findActiveRefreshToken(existingToken);

  if (!current || !current.User?.IsActive) {
    return null;
  }

  const role = metadata.role || current.User.UserRole?.[0]?.Role?.RoleName || 'student';
  const accessToken = signAccessToken(current.User, role);
  const nextRefreshToken = signRefreshToken(current.User.UserID);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { RefreshTokenID: current.RefreshTokenID },
      data: {
        RevokedAt: new Date(),
      },
    }),
    prisma.refreshToken.create({
      data: {
        UserID: current.UserID,
        TokenJti: nextRefreshToken.jti,
        TokenHash: hashToken(nextRefreshToken.token),
        CreatedAt: new Date(),
        ExpiresAt: nextRefreshToken.expiresAt,
        CreatedByIp: metadata.ip || null,
        CreatedByUserAgent: metadata.userAgent || null,
      },
    }),
  ]);

  return {
    user: current.User,
    role,
    accessToken,
    refreshToken: nextRefreshToken.token,
    refreshTokenExpiresAt: nextRefreshToken.expiresAt,
  };
}

async function revokeRefreshToken(token) {
  if (!prisma.refreshToken || typeof prisma.refreshToken.update !== 'function') {
    return false;
  }

  const current = await findActiveRefreshToken(token);

  if (!current) {
    return false;
  }

  await prisma.refreshToken.update({
    where: { RefreshTokenID: current.RefreshTokenID },
    data: { RevokedAt: new Date() },
  });

  return true;
}

async function revokeAllRefreshTokensForUser(userId) {
  if (!prisma.refreshToken || typeof prisma.refreshToken.updateMany !== 'function') {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      UserID: userId,
      RevokedAt: null,
    },
    data: {
      RevokedAt: new Date(),
    },
  });
}

function getAccessTokenTtlMs() {
  return parseTokenTtl(ACCESS_TOKEN_TTL);
}

function getRefreshTokenTtlMs() {
  return parseTokenTtl(REFRESH_TOKEN_TTL);
}

function getAuthCookieDefaults() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(process.env.COOKIE_SECURE || '').trim().toLowerCase() === 'true',
    path: '/',
  };
}

module.exports = {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  issueAuthTokens,
  findActiveRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  getAccessTokenTtlMs,
  getRefreshTokenTtlMs,
  getAuthCookieDefaults,
};
