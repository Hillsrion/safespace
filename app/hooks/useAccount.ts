import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useActionData, useLoaderData } from "react-router";
import { validatePassword, type PasswordRequirement } from "~/lib/password";

type AccountFormData = z.infer<typeof accountSchema>;

export type ActionData = {
  success?: boolean;
  errors?: {
    fieldErrors?: Partial<Record<keyof AccountFormData, string[]>>;
    formErrors?: string[];
  };
};

// A new password is optional. When supplied, it must be confirmed and the
// current password is required. The current password may also be submitted on
// its own to authorize a sensitive email change.
const passwordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(
        1,
        "Le mot de passe actuel est requis pour modifier le mot de passe"
      ),
    newPassword: z
      .string()
      .min(1, "Le nouveau mot de passe est requis")
      .refine((password) => validatePassword(password), {
        message:
          "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial",
      }),
    confirmPassword: z
      .string()
      .min(1, "Veuillez confirmer votre nouveau mot de passe"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const accountSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Adresse email invalide")
      .max(254, "Adresse email trop longue"),
    firstName: z
      .string()
      .trim()
      .min(1, "Le prénom est requis")
      .max(100, "Prénom trop long"),
    lastName: z
      .string()
      .trim()
      .min(1, "Le nom est requis")
      .max(100, "Nom trop long"),
    instagram: z.string().trim().max(100, "Identifiant Instagram trop long").optional(),
    // Les champs de mot de passe sont optionnels au niveau supérieur
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // The current password alone is valid: the service uses it to reauthorize
    // an email change. A new password still requires all three fields.
    if (data.newPassword || data.confirmPassword) {
      const result = passwordChangeSchema.safeParse({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });

      if (!result.success) {
        result.error.issues.forEach((issue) => {
          ctx.addIssue(issue);
        });
      }
    }
  });

export type { PasswordRequirement };

export function useAccount() {
  const user = useLoaderData<{
    email: string;
    firstName: string;
    lastName: string;
    instagram?: string;
  }>();

  const actionData = useActionData<ActionData>();

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      instagram: user.instagram || "",
      // Ensure password fields are always empty by default
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    // Reset form values when user data changes
    values: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      instagram: user.instagram || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  return {
    form,
    actionData,
  };
}
