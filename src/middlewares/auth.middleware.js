const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const requireInternalToken = (req, res, next) => {
    const configuredToken = process.env.INTERNAL_API_TOKEN;
    const providedToken = req.get('x-internal-token');
    if (!configuredToken || !providedToken || providedToken !== configuredToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
};

module.exports = { requireAuth, requireInternalToken };
