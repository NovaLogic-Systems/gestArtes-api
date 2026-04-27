const { createHttpError } = require('./http-error');

function toTimeOnlyDate(value, message) {
  const raw = value instanceof Date ? value : String(value ?? '').trim();

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw createHttpError(400, message);
    }

    return new Date(Date.UTC(
      1970,
      0,
      1,
      raw.getUTCHours(),
      raw.getUTCMinutes(),
      raw.getUTCSeconds(),
      raw.getUTCMilliseconds()
    ));
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);

  if (!match) {
    throw createHttpError(400, message);
  }

  return new Date(Date.UTC(
    1970,
    0,
    1,
    Number(match[1]),
    Number(match[2]),
    Number(match[3] || 0),
    0
  ));
}

function formatTimeOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(11, 19);
}

function formatDateLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return String(date || '');
  }

  const pad = (n) => String(n).padStart(2, '0');

  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

module.exports = { toTimeOnlyDate, formatTimeOnly, formatDateLabel };
