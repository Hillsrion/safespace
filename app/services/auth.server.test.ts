import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.server", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

import bcrypt from "bcryptjs";
import { prisma } from "../db/client.server";
import { InvalidCredentialsError, login, withoutPassword } from "./auth.server";

describe("authenticated user projection", () => {
  it("keeps password hashes out of session-safe user data", () => {
    const user = withoutPassword({
      id: "user-1",
      email: "member@example.com",
      password: "secret-hash",
      firstName: "Safe",
      lastName: "Member",
      instagram: null,
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(user).not.toHaveProperty("password");
    expect(user.id).toBe("user-1");
  });
});

describe("login timing safety", () => {
  it("performs a bcrypt comparison even when the email does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      login("missing@example.com", "Wrong-password-1!")
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "Wrong-password-1!",
      expect.stringMatching(/^\$2b\$12\$/)
    );
  });
});
