import { Authenticator } from "remix-auth";
import { FormStrategy } from "remix-auth-form";
import prisma from "~/lib/prisma";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

// Create an instance of the authenticator
export const authenticator = new Authenticator<User>();

const errorMessage = "Invalid credentials";

export async function login(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(errorMessage);
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new Error(errorMessage);
  }

  return user;
}

// Configure FormStrategy for email/password authentication
authenticator.use(
  new FormStrategy(async ({ form }) => {
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (!email || !password) {
      throw new Error(errorMessage);
    }

    // Authenticate user
    const user = await login(email, password);
    return user;
  }),
  "user-pass" // Strategy name
);
