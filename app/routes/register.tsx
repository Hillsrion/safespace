import { redirect, data } from "@remix-run/node";
import { Form, useActionData } from "react-router";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { validatePassword, hashPassword } from "~/lib/password";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const prisma = new PrismaClient();

const registrationSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
});

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const { email, password, confirmPassword } = registrationSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  // Verify password match
  if (password !== confirmPassword) {
    return data({ error: "Passwords do not match" }, { status: 400 });
  }

  // Validate password strength
  const passwordError = validatePassword(password);
  if (passwordError) {
    return data({ error: passwordError }, { status: 400 });
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return data({ error: "User with this email already exists" }, { status: 400 });
  }

  // Create user
  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      name: "", // Can be updated later
    },
  });

  // Create session
  return redirect("/welcome", {
    headers: {
      "Set-Cookie": `auth=${user.id}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export default function RegisterRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="w-full max-w-md mx-auto">
        <div className="flex flex-col items-center justify-center space-y-4 p-6">
          <h2 className="text-2xl font-bold tracking-tight">Register</h2>
          <p className="text-sm text-muted-foreground">
            Create your account
          </p>
        </div>
        <CardContent>
          {actionData?.error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {actionData.error}
            </div>
          )}
          <Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                type="email"
                name="email"
                id="email"
                required
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                name="password"
                id="password"
                required
                placeholder="Enter your password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                type="password"
                name="confirmPassword"
                id="confirmPassword"
                required
                placeholder="Confirm your password"
              />
            </div>
            <Button type="submit" className="w-full">
              Register
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
