import { data, redirect } from "react-router";
import { prisma } from "~/db/client.server";
import { hashPassword } from "~/lib/password";
import { getSession, commitSession } from "~/services/session.server";
import { registerSchema } from "~/hooks/useRegister";
import { requireSameOrigin } from "~/lib/security.server";
import { isInviteEligible, normalizeSpaceRole } from "~/lib/invitations";
import { getInviteTokenCandidates } from "~/lib/invite-token.server";
import { runWithDbContext } from "~/db/context.server";

export async function action({ request }: { request: Request }) {
  requireSameOrigin(request);
  try {
    const formData = await request.formData();
    const dataObj = {
      ...Object.fromEntries(formData),
      codeOfConductAccepted:
        formData.get("codeOfConductAccepted") === "on" ||
        formData.get("codeOfConductAccepted") === "true",
    };

    const parsedData = registerSchema.safeParse(dataObj);
    if (!parsedData.success) {
      const errors = parsedData.error.flatten();
      return data(
        {
          errors: {
            fieldErrors: errors.fieldErrors,
            formErrors: errors.formErrors,
          },
        },
        { status: 400 }
      );
    }

    const {
      email: rawEmail,
      password,
      firstName,
      lastName,
      instagram,
      inviteToken,
    } = parsedData.data;
    const email = rawEmail.trim().toLowerCase();

    const hashedPassword = await hashPassword(password);
    const now = new Date();

    const inviteTokens = getInviteTokenCandidates(inviteToken);
    const user = await runWithDbContext(
      { mode: "registration", email, inviteTokens },
      () => prisma.$transaction(async (transaction) => {
        const invite = await transaction.invite.findFirst({
          where: { token: { in: inviteTokens } },
        });

        if (!isInviteEligible(invite, email, now)) {
          throw new InvalidInviteError();
        }

        const role = normalizeSpaceRole(invite.roleToAssign);
        if (!role) {
          throw new InvalidInviteError();
        }

        const claimed = await transaction.invite.updateMany({
          where: {
            id: invite.id,
            isUsed: false,
            expiresAt: { gt: now },
          },
          data: { isUsed: true },
        });

        if (claimed.count !== 1) {
          throw new InvalidInviteError();
        }

        const createdUser = await transaction.user.create({
          data: {
            email,
            password: hashedPassword,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            instagram: instagram?.trim() || null,
            codeOfConductAcceptedAt: now,
          },
        });

        await transaction.userSpaceMembership.create({
          data: {
            userId: createdUser.id,
            spaceId: invite.spaceId,
            role,
          },
        });

        return createdUser;
      })
    );

    const session = await getSession(request);
    session.set("userId", user.id);

    return redirect("/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    if (error instanceof InvalidInviteError) {
      return data(
        {
          errors: {
            fieldErrors: {},
            formErrors: [
              "This invitation is invalid, expired, already used, or does not match this email.",
            ],
          },
        },
        { status: 400 }
      );
    }

    console.error("Registration failed", error);
    return data(
      {
        errors: {
          fieldErrors: {},
          formErrors: ["An unexpected error occurred"],
        },
      },
      { status: 500 }
    );
  }
}

class InvalidInviteError extends Error {}
