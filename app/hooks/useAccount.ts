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

// Password fields are all optional, but if any are provided, they must all be provided and valid
const passwordSchema = z
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
    email: z.string().email("Adresse email invalide"),
    firstName: z.string().min(1, "Le prénom est requis"),
    lastName: z.string().min(1, "Le nom est requis"),
    instagram: z.string().optional(),
    // Les champs de mot de passe sont optionnels au niveau supérieur
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Ne valider les champs de mot de passe que si au moins un est rempli
    if (data.newPassword || data.currentPassword || data.confirmPassword) {
      const result = passwordSchema.safeParse({
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
