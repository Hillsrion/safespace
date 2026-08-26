import type { PrismaClient } from "../generated/prisma";
import { prisma } from "../db/client.server";
import { hashPassword, verifyPassword } from "../lib/password";

type AccountProfileInput = {
  email: string;
  firstName: string;
  lastName: string;
  instagram?: string;
  currentPassword?: string;
  newPassword?: string;
};

export class AccountProfileError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly field: "currentPassword" | undefined,
    message: string
  ) {
    super(message);
    this.name = "AccountProfileError";
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function updateOwnAccount(
  userId: string,
  input: AccountProfileInput,
  client: PrismaClient = prisma
): Promise<void> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const hashedNewPassword = input.newPassword
    ? await hashPassword(input.newPassword)
    : undefined;

  try {
    await client.$transaction(async (tx) => {
      // Re-read credentials inside the same transaction as the update. This
      // prevents a stale page or session from authorizing an identity change.
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          instagram: true,
          password: true,
        },
      });
      if (!currentUser) {
        throw new AccountProfileError(404, undefined, "Utilisateur non trouvé");
      }

      const emailChanged = currentUser.email.toLowerCase() !== normalizedEmail;
      const passwordChanged = Boolean(hashedNewPassword);
      if (emailChanged || passwordChanged) {
        const passwordIsValid = input.currentPassword
          ? await verifyPassword(input.currentPassword, currentUser.password)
          : false;
        if (!passwordIsValid) {
          throw new AccountProfileError(
            400,
            "currentPassword",
            "Le mot de passe actuel est requis et doit être correct"
          );
        }
      }

      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      const instagram = input.instagram?.trim() || null;
      const changedFields = [
        ...(currentUser.firstName !== firstName ? ["firstName"] : []),
        ...(currentUser.lastName !== lastName ? ["lastName"] : []),
        ...(currentUser.instagram !== instagram ? ["instagram"] : []),
        ...(emailChanged ? ["email"] : []),
        ...(passwordChanged ? ["password"] : []),
      ];
      if (changedFields.length === 0) return;
      await tx.user.update({
        where: { id: userId },
        data: {
          email: normalizedEmail,
          firstName,
          lastName,
          instagram,
          ...(hashedNewPassword ? { password: hashedNewPassword } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: "account_update",
          targetEntityType: "user",
          targetEntityId: userId,
          details: { changedFields },
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof AccountProfileError) throw error;
    if (isUniqueConstraintError(error)) {
      // Do not expose which account already owns the requested address.
      throw new AccountProfileError(
        409,
        undefined,
        "Impossible d’utiliser cette adresse email"
      );
    }
    throw error;
  }
}
