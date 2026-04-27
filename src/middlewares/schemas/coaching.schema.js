const { z } = require('zod');

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
}

const createTeacherSessionSchema = z.object({
  date: z.string().datetime({ offset: true }),
  studioId: z.coerce.number().int().positive(),
  modalityId: z.coerce.number().int().positive(),
  capacity: z.coerce.number().int().positive(),
  pricePerHour: z.coerce.number().positive(),
  isExternal: z.preprocess(parseBoolean, z.boolean()).optional().default(false),
  isOutsideStdHours: z.preprocess(parseBoolean, z.boolean()).optional().default(false),
});

module.exports = { createTeacherSessionSchema };