import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useActionData } from "react-router";
import { validatePassword, type PasswordRequirement } from "~/lib/password";

type RegisterFormData = z.infer<typeof registerSchema>;

export type ActionData = {
  errors?: {
    fieldErrors?: Partial<Record<keyof RegisterFormData, string[]>>;
    formErrors?: string[];
  };
};

export const registerSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .refine(
        (password) => {
          return validatePassword(password);
        },
        {
          message:
            "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character",
        }
      ),
    confirmPassword: z.string(),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    instagram: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type { PasswordRequirement };

export function useRegister() {
  const actionData = useActionData<ActionData>();

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      instagram: "",
    },
  });

  return {
    form,
    actionData,
  };
}
