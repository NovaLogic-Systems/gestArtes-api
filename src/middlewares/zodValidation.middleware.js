function formatZodIssue(issue) {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'body';

  return {
    path,
    message: issue.message,
  };
}

function validateZod(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (result.success) {
      req[source] = result.data;
      return next();
    }

    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map(formatZodIssue),
    });
  };
}

module.exports = { validateZod };
