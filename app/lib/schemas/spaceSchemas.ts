import { z } from 'zod';

export const createSpaceSchema = z.object({
  name: z.string({
    required_error: "Le nom de l'espace est requis.",
    invalid_type_error: "Le nom de l'espace doit être une chaîne de caractères.",
  }),
  description: z.string({
    invalid_type_error: "La description doit être une chaîne de caractères.",
  }).optional(),
});
