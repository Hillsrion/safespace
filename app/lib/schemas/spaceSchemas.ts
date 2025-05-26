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

export const leaveSpaceSchema = z.object({
  spaceId: z.string({
    required_error: "L'identifiant de l'espace est requis.",
    invalid_type_error: "L'identifiant de l'espace doit être une chaîne de caractères.",
  }).min(1, "L'identifiant de l'espace ne peut pas être vide."),
});

export const leaveSpaceSchema = z.object({
  spaceId: z.string({
    required_error: "L'identifiant de l'espace est requis.",
    invalid_type_error: "L'identifiant de l'espace doit être une chaîne de caractères.",
  }).min(1, "L'identifiant de l'espace ne peut pas être vide."),
});
