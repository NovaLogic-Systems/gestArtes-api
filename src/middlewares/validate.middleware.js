const { validationResult } = require('express-validator');

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    next();
    return;
  }

  res.status(400).json({
    error: 'Validation failed',
    details: errors.array({ onlyFirstError: true }),
  });
}

module.exports = validateRequest;
