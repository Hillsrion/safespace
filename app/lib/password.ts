import bcrypt from "bcryptjs";

export interface PasswordRequirement {
  valid: boolean;
  message: string;
}

export function checkPasswordRequirements(
  password: string
): PasswordRequirement[] {
  return [
    {
      valid: password.length >= 8,
      message: "Au moins 8 caractères",
    },
    {
      valid: /[A-Z]/.test(password),
      message: "Au moins une majuscule",
    },
    {
      valid: /[a-z]/.test(password),
      message: "Au moins une minuscule",
    },
    {
      valid: /[0-9]/.test(password),
      message: "Au moins un chiffre",
    },
    {
      valid: /[^a-zA-Z0-9]/.test(password),
      message: "Au moins un caractère spécial",
    },
  ];
}

export function validatePassword(password: string): boolean {
  return Object.values(checkPasswordRequirements(password)).every(
    (requirement) => requirement.valid
  );
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
