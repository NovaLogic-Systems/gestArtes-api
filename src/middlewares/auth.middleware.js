function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  next();
}

module.exports = {
  requireAuth,
};
