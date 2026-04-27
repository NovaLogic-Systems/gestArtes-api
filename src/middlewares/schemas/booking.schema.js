const { z } = require('zod');

const bookingSchema = z
  .object({
    teacherId: z.coerce.number().int().positive(),
    studioId: z.coerce.number().int().positive(),
    modalityId: z.coerce.number().int().positive(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    maxParticipants: z.coerce.number().int().positive().max(50).optional(),
    notes: z.string().trim().max(255).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'Intervalo temporal inválido',
      });
    }
  });

module.exports = { bookingSchema };
