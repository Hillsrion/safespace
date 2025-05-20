import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useActionData } from "react-router";

type LoginFormData = z.infer<typeof loginSchema>;

export type ActionData = {
  errors?: {
    fieldErrors?: Partial<Record<keyof LoginFormData, string[]>>;
    formErrors?: string[];
  };
};

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function useLogin() {
  const actionData = useActionData<ActionData>();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  return {
    form,
    actionData,
  };
}
