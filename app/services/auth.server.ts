import { Authenticator } from "remix-auth";
import { FormStrategy } from "remix-auth-form";
import { prisma } from "~/db/client.server";
import bcrypt from "bcryptjs";
import { throwHttpError } from "~/lib/api/http-error";
import type { User } from "~/generated/prisma";
import { getSession } from "./session.server";
import { redirect } from "react-router";

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

export async function isAuthenticated(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return false;
  }

  return true;
}

export async function getCurrentUser(request: Request) {
  const session = await getSession(request);
  const user = session.get("user") as User | null;

  if (!user) {
    return null;
  }

  return user;
}

export async function logout(request: Request) {
  const session = await getSession(request);
  session.unset("user");
  return redirect("/auth/login");
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

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throwHttpError(401, "Unauthorized", "unauthorized:auth");
  }
  return user;
}
