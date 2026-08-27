import { data, redirect } from "react-router";
import { prisma } from "~/db/client.server";
import { hashPassword } from "~/lib/password";
import { getSession, commitSession } from "~/services/session.server";
import { registerSchema } from "~/hooks/useRegister";
import { requireSameOrigin } from "~/lib/security.server";
import { isInviteEligible, normalizeSpaceRole } from "~/lib/invitations";
import { getInviteTokenCandidates } from "~/lib/invite-token.server";
import { runWithDbContext } from "~/db/context.server";
import { logServerException } from "~/lib/error/server-error.server";
import { getCurrentUser, InvalidCredentialsError, login } from "~/services/auth.server";
import { acceptInvitationForExistingUser, InvalidInviteError } from "~/services/invite-acceptance.server";

export async function action({ request }: { request: Request }) {
  requireSameOrigin(request);
  if (request.method.toUpperCase() !== "POST") {
    return data({ errors: { fieldErrors: {}, formErrors: ["Method not allowed"] } }, { status: 405, headers: { Allow: "POST" } });
  }
  try {
    const formData = await request.formData();
    if (formData.get("intent") === "accept-invite") {
      const token = String(formData.get("inviteToken") ?? "").trim();
      const accepted = ["on", "true"].includes(String(formData.get("codeOfConductAccepted")));
      if (!accepted || !token) {
        return data({ errors: { fieldErrors: {}, formErrors: ["A valid invitation and Code of Conduct acceptance are required."] } }, { status: 400 });
      }
      const currentUser = await getCurrentUser(request);
      const user = currentUser ?? await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
      const { spaceId } = await acceptInvitationForExistingUser(user, token);
      const session = await getSession(request);
      session.set("userId", user.id);
      return redirect(`/dashboard/welcome?${new URLSearchParams({ spaceId })}`, {
        status: 303, headers: { "Set-Cookie": await commitSession(session) },
      });
    }
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
    const { user, spaceId } = await runWithDbContext(
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

        return { user: createdUser, spaceId: invite.spaceId };
      })
    );

    const session = await getSession(request);
    session.set("userId", user.id);

    return redirect(`/dashboard/welcome?${new URLSearchParams({ spaceId })}`, {
      status: 303,
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return data({ errors: { fieldErrors: {}, formErrors: ["Invalid credentials"] } }, { status: 401 });
    }
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

    logServerException(error, { operation: "auth.register", errorCode: "server_error:api", httpStatus: 500 });
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
