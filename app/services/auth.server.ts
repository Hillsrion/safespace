import { Authenticator } from "remix-auth";
import { FormStrategy } from "remix-auth-form";
import { prisma } from "~/db/client.server";
import bcrypt from "bcryptjs";
import { throwHttpError } from "~/lib/api/http-error";
import type { Prisma } from "~/generated/prisma";
import { destroySession, getSession } from "./session.server";
import { redirect } from "react-router";

const authenticatedUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  instagram: true,
  isSuperAdmin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type AuthenticatedUser = Prisma.UserGetPayload<{
  select: typeof authenticatedUserSelect;
}>;

export function withoutPassword(
  user: AuthenticatedUser & { password: string }
): AuthenticatedUser {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

// Create an instance of the authenticator
export const authenticator = new Authenticator<AuthenticatedUser>();

const errorMessage = "Invalid credentials";
// A valid, non-secret bcrypt hash keeps the missing-user path computationally
// equivalent to the wrong-password path and avoids an email enumeration signal.
const INVALID_LOGIN_PASSWORD_HASH =
  "$2b$12$sNfRvwDCcSBHi9fsBUTC9euzo4zPGBupSR.Zli50.dVdczq1FtEbK";

export async function login(
  email: string,
  password: string
): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      ...authenticatedUserSelect,
      password: true,
    },
  });
  const isValidPassword = await bcrypt.compare(
    password,
    user?.password ?? INVALID_LOGIN_PASSWORD_HASH
  );
  if (!user || !isValidPassword) {
    throw new Error(errorMessage);
  }

  return withoutPassword(user);
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
  const userId = session.get("userId");

  if (typeof userId !== "string") {
    return null;
  }

  // Always re-read authorization-sensitive attributes from the database so a
  // role revocation or account deletion takes effect on the next request.
  return prisma.user.findUnique({
    where: { id: userId },
    select: authenticatedUserSelect,
  });
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/auth/login", {
    headers: { "Set-Cookie": await destroySession(session) },
  });
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

export async function requireUserId(request: Request): Promise<string> {
  return (await requireUser(request)).id;
}
