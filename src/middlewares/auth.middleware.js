function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  next();
}

function requireSessionAuth(req, res, next) {
  requireAuth(req, res, next);
}

function requireAdminRole(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.session.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

module.exports = {
  requireAuth,
  requireSessionAuth,
  requireAdminRole,
};
