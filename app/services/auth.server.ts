import { Authenticator } from "remix-auth";
import { FormStrategy } from "remix-auth-form";
import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Create an instance of the authenticator
export const authenticator = new Authenticator<User>();

// Login function to verify user credentials
async function login(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error("User not found");
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error("Invalid password");
  }

  return user;
}

// Configure FormStrategy for email/password authentication
authenticator.use(
  new FormStrategy(async ({ form }) => {
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    // Authenticate user
    const user = await login(email, password);
    return user;
  }),
  "user-pass" // Strategy name
);
