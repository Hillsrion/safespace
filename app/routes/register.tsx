import { data, redirect } from "@remix-run/node";
import { useActionData, Form as RemixForm } from "react-router";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import prisma from "~/lib/prisma";
import type { User } from "@prisma/client";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { PasswordInput } from "~/components/ui/password-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Check, HelpCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { hashPassword } from "~/lib/password";

import { getSession, commitSession } from "~/services/session.server";

import { validatePassword, checkPasswordRequirements } from "~/lib/password";
import type { PasswordRequirement } from "~/lib/password";

const registerSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters")
      .refine((password) => {
        return validatePassword(password);
      }, {
        message: "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character"
      }),
    confirmPassword: z.string(),
    name: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export async function action({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const dataObj = Object.fromEntries(formData);

    const parsedData = registerSchema.safeParse(dataObj);
    if (!parsedData.success) {
      const errors = parsedData.error.flatten();
      return data(
        {
          errors: {
            fieldErrors: errors.fieldErrors,
            formErrors: errors.formErrors,
          },
        },
        { status: 400 }
      );
    }

    const { email, password, name } = parsedData.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return data(
        {
          errors: {
            fieldErrors: {},
            formErrors: ["Email already in use"],
          },
        },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || "",
      },
    });

    const session = await getSession(request);
    const userForSession: Pick<User, "id" | "email" | "name"> = {
      id: user.id,
      email: user.email,
      name: user.name,
    };
    session.set("user", userForSession);

    return redirect("/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    console.log(error)
    return data(
      {
        errors: {
          fieldErrors: {},
          formErrors: ["An unexpected error occurred"],
        },
      },
      { status: 500 }
    );
  }
}

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  const user = session.get("user");
  if (user) return redirect("/dashboard");
  return null;
}

type ActionData = {
  errors?: {
    fieldErrors?: Partial<Record<keyof RegisterFormData, string[]>>;
    formErrors?: string[];
  };
};

export default function Register() {
  const actionData = useActionData<ActionData>();

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
    },
    
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-md mx-auto">
          <div className="flex flex-col items-center justify-center p-6">
            <h2 className="text-2xl font-bold tracking-tight">Register</h2>
            <p className="text-sm text-muted-foreground mt-1">Create your account</p>
          </div>
          <CardContent>
            {actionData?.errors?.formErrors?.map((error, index) => (
              <div
                key={index}
                className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
              >
                {error}
              </div>
            ))}
            <Form {...form}>
              <RemixForm method="post" className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.email?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel>Password</FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-4 h-4 text-gray-500 hover:text-gray-700 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-gray-600 mb-3">Password requirements:</p>
                              <div className="space-y-2">
                                {checkPasswordRequirements(field.value).map((requirement: PasswordRequirement, index: number) => (
                                  <div key={index} className="flex items-center gap-3">
                                    <span className={`rounded-full flex items-center justify-center transition-colors duration-300 ${
                                      requirement.valid ? 'bg-green-500' : 'bg-gray-300'
                                    }`}>
                                      <Check className="w-4 h-4 text-white" />
                                    </span>
                                    <span className={`font-medium transition-colors duration-300 ${
                                      requirement.valid ? 'text-green-700' : 'text-gray-500'
                                    }`}>
                                      {requirement.message}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <PasswordInput
                          field={field}
                          placeholder="Enter your password"
                        />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.password?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <PasswordInput
                          field={field}
                          placeholder="Confirm your password"
                        />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.confirmPassword?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.name?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full mt-6">
                  Register
                </Button>
              </RemixForm>
            </Form>

            <p className="text-center text-sm mt-3">
              Already have an account?{" "}
              <a href="/login" className="text-blue-500 hover:underline">
                Log in
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}