import { describe, expect, it } from "vitest";
import { withoutPassword } from "./auth.server";

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
