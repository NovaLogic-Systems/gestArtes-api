const { z } = require('zod');

const bookingSchema = z.object({
  teacherId: z.number({ coerce: true }).int().positive(),
  studioId: z.number({ coerce: true }).int().positive(),
  modalityId: z.number({ coerce: true }).int().positive(),
  startTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  endTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  maxParticipants: z.number({ coerce: true }).int().positive().optional(),
  notes: z.string().max(255).optional(),
}).refine((booking) => new Date(booking.endTime) > new Date(booking.startTime), {
  path: ['endTime'],
  message: 'End time must be after start time',
});

module.exports = { bookingSchema };
