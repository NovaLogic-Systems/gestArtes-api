const { z } = require('zod');

const listingSchema = z.object({
  title: z.string().trim().min(1, 'Título inválido').max(100, 'Título inválido'),
  description: z.string().trim().max(255, 'Descrição inválida').optional(),
  price: z.coerce.number().positive('Preço inválido'),
  conditionId: z.coerce.number().int().positive('Condição inválida'),
  categoryId: z.coerce.number().int().positive('Categoria inválida').optional(),
  photoUrl: z.string().trim().max(255, 'Foto inválida').optional(),
  location: z.string().trim().max(100, 'Localização inválida').optional(),
});

const updateListingSchema = listingSchema.partial().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Nenhum campo para atualizar',
    });
  }
});

module.exports = { listingSchema, updateListingSchema };
