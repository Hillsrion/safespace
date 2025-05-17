import bcrypt from "bcryptjs";

// ==============================
// Password Validation
// ==============================

export function validatePassword(password: string): string | null {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("at least 8 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("one number");
  }

  // Accept any non-alphanumeric character
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("one special character (symbol or punctuation)");
  }

  if (errors.length > 0) {
    return `Password must contain ${errors.join(", ")}`;
  }

  return null;
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
