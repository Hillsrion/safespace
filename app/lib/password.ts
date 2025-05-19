import bcrypt from "bcryptjs";

export interface PasswordRequirement {
  valid: boolean;
  message: string;
}

export function checkPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      valid: password.length >= 8,
      message: "At least 8 characters"
    },
    {
      valid: /[A-Z]/.test(password),
      message: "At least one uppercase letter"
    },
    {
      valid: /[a-z]/.test(password),
      message: "At least one lowercase letter"
    },
    {
      valid: /[0-9]/.test(password),
      message: "At least one number"
    },
    {
      valid: /[^a-zA-Z0-9]/.test(password),
      message: "At least one special character"
    }
  ];
}

export function validatePassword(password: string): boolean {
  return Object.values(checkPasswordRequirements(password)).every(requirement => requirement);
}

// ==============================
// Bcrypt Utilities
// ==============================

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
