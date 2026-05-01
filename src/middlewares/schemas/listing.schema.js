/**
 * @file src/middlewares/schemas/listing.schema.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const { z } = require('zod');

const listingSchema = z.object({
  title: z.string().min(1).max(100).trim(),
  description: z.string().max(255).optional(),
  price: z.coerce.number().nonnegative('Preço inválido'),
});

const updateListingSchema = z.object({
  title: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(255).optional(),
  price: z.coerce.number().nonnegative('Preço inválido').optional(),
});

module.exports = { listingSchema, updateListingSchema };


