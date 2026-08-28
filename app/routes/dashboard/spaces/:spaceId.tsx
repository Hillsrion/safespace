import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form as RouterForm,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MemberAdminActions } from "~/components/member-admin-actions";
import { prisma } from "~/db/client.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import {
  createInviteToken,
  INVITE_TTL_MS,
} from "~/lib/invite-token.server";
import { normalizeSpaceRole } from "~/lib/invitations";
import { logServerException } from "~/lib/error/server-error.server";
import { requireSameOrigin } from "~/lib/security.server";
import { getCurrentUser } from "~/services/auth.server";
import { trackVisitedSpace } from "~/services/space-activity-tracking.server";
import { activityDayLabel, activityWindow } from "~/lib/member-activity";
import {
  sendInviteEmail,
  type InviteDelivery,
} from "~/services/invite-email.server";

export const handle = { crumb: "Gestion de l’espace" };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"]),
});

const MEMBER_PAGE_SIZE = 25;
const MEMBER_ROLES = ["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"] as const;

function memberRoleValues(role: (typeof MEMBER_ROLES)[number]) {
  const displayRole = role
    .toLowerCase()
    .replace("_", "-")
    .replace(/(^|-)([a-z])/g, (_, separator: string, character: string) =>
      `${separator}${character.toUpperCase()}`
    );
  return [role, role.toLowerCase(), displayRole];
}

type ActionData = {
  success?: boolean;
  message: string;
  inviteUrl?: string;
  delivery?: InviteDelivery["status"];
  errors?: Record<string, string[]>;
};

function appOrigin(request: Request): string {
  const configuredOrigin = process.env.APP_URL?.trim();
  if (!configuredOrigin) {
    if (process.env.NODE_ENV === "production" && process.env.RESEND_API_KEY) {
      throw new Error("APP_URL is required when invitation email is enabled");
    }
    return new URL(request.url).origin;
  }

  const url = new URL(configuredOrigin);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("APP_URL must use http or https");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL must use https in production");
  }
  return url.origin;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");

  const spaceId = params.spaceId;
  if (!spaceId) throw new Response("Espace introuvable", { status: 404 });

  const role = await getUserSpaceRole(user.id, spaceId);
  if (!role) throw new Response("Accès refusé", { status: 403 });

  const isAdmin = user.isSuperAdmin || role === "ADMIN";
  const url = new URL(request.url);
  const memberQuery = url.searchParams.get("memberQ")?.trim().slice(0, 100) ?? "";
  const requestedMemberRole = url.searchParams.get("memberRole");
  const memberRole = MEMBER_ROLES.find((candidate) => candidate === requestedMemberRole);
  const requestedMemberPage = Number.parseInt(url.searchParams.get("memberPage") ?? "1", 10);
  const memberPage = Number.isFinite(requestedMemberPage)
    ? Math.min(Math.max(requestedMemberPage, 1), 100)
    : 1;
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  if (!space) throw new Response("Espace introuvable", { status: 404 });
  await trackVisitedSpace(user.id, spaceId);

  const memberWhere = {
    spaceId,
    ...(memberRole ? { role: { in: memberRoleValues(memberRole) } } : {}),
    ...(memberQuery
      ? {
          user: {
            OR: [
              { email: { contains: memberQuery, mode: "insensitive" as const } },
              { firstName: { contains: memberQuery, mode: "insensitive" as const } },
              { lastName: { contains: memberQuery, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };
  const [members, memberTotal, invites] = isAdmin
    ? await Promise.all([
        prisma.userSpaceMembership.findMany({
          where: memberWhere,
          orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
          skip: (memberPage - 1) * MEMBER_PAGE_SIZE,
          take: MEMBER_PAGE_SIZE,
          select: {
            role: true,
            joinedAt: true,
            activity: { select: { lastActiveDay: true } },
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
        prisma.userSpaceMembership.count({ where: memberWhere }),
        prisma.invite.findMany({
          where: { spaceId },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            email: true,
            roleToAssign: true,
            expiresAt: true,
            isUsed: true,
            createdAt: true,
          },
        }),
      ])
    : [[], 0, []];

  const window = activityWindow();
  const activeMembersSevenDays = isAdmin ? await prisma.memberSpaceActivity.count({
    where: { spaceId, lastActiveDay: { gte: window.since, lte: window.through } },
  }) : null;
  return data({
    space,
    role,
    isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    members,
    memberPage,
    memberQuery,
    memberRole: memberRole ?? "",
    memberTotal,
    activeMembersSevenDays,
    memberTotalPages: Math.max(1, Math.ceil(memberTotal / MEMBER_PAGE_SIZE)),
    invites,
  });
}

class AlreadyMemberError extends Error {}
class AuthorizationChangedError extends Error {}

export async function action({ request, params }: ActionFunctionArgs) {
  requireSameOrigin(request);
  const user = await getCurrentUser(request);
  if (!user) {
    return data<ActionData>({ message: "Authentification requise." }, { status: 401 });
  }

  const spaceId = params.spaceId;
  if (!spaceId) {
    return data<ActionData>({ message: "Espace introuvable." }, { status: 404 });
  }

  const currentRole = await getUserSpaceRole(user.id, spaceId);
  if (!user.isSuperAdmin && currentRole !== "ADMIN") {
    return data<ActionData>({ message: "Droits administrateur requis." }, { status: 403 });
  }

  const parsed = inviteSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data<ActionData>(
      {
        message: "Vérifiez les informations de l’invitation.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  if (parsed.data.role === "ADMIN" && !user.isSuperAdmin) {
    return data<ActionData>(
      { message: "Seul un super-administrateur peut inviter un administrateur." },
      { status: 403 }
    );
  }

  let origin: string;
  try {
    origin = appOrigin(request);
  } catch (error) {
    logServerException(error, {
      operation: "space.mutate",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return data<ActionData>(
      { message: "La configuration du lien d’invitation est invalide." },
      { status: 500 }
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const { rawToken, tokenHash } = createInviteToken();

  try {
    const result = await prisma.$transaction(async (transaction) => {
      // Re-check privileges inside the write transaction so a concurrent role
      // revocation cannot race the initial authorization check.
      const actor = await transaction.user.findUnique({
        where: { id: user.id },
        select: {
          isSuperAdmin: true,
          memberships: {
            where: { spaceId },
            take: 1,
            select: { role: true },
          },
        },
      });
      const actorRole = normalizeSpaceRole(actor?.memberships[0]?.role ?? "");
      if (!actor || (!actor.isSuperAdmin && actorRole !== "ADMIN")) {
        throw new AuthorizationChangedError();
      }
      if (parsed.data.role === "ADMIN" && !actor.isSuperAdmin) {
        throw new AuthorizationChangedError();
      }

      const space = await transaction.space.findUnique({
        where: { id: spaceId },
        select: { id: true, name: true },
      });
      if (!space) throw new Response("Espace introuvable", { status: 404 });

      const existingMember = await transaction.userSpaceMembership.findFirst({
        where: {
          spaceId,
          user: { email: { equals: parsed.data.email, mode: "insensitive" } },
        },
        select: { userId: true },
      });
      if (existingMember) throw new AlreadyMemberError();

      // Invalidate older pending links for the same recipient and space.
      await transaction.invite.updateMany({
        where: {
          spaceId,
          email: { equals: parsed.data.email, mode: "insensitive" },
          isUsed: false,
          expiresAt: { gt: now },
        },
        data: { expiresAt: now },
      });

      const invite = await transaction.invite.create({
        data: {
          email: parsed.data.email,
          token: tokenHash,
          spaceId,
          roleToAssign: parsed.data.role,
          invitedByUserId: user.id,
          expiresAt,
        },
        select: { id: true },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "user_invite",
          targetEntityType: "Invite",
          targetEntityId: invite.id,
          spaceId,
          details: {
            email: parsed.data.email,
            role: parsed.data.role,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return space;
    });

    const inviteUrl = `${origin}/auth/register?token=${encodeURIComponent(rawToken)}`;
    const delivery = await sendInviteEmail({
      email: parsed.data.email,
      inviteUrl,
      inviterName: `${user.firstName} ${user.lastName}`.trim() || "Un administrateur",
      role: parsed.data.role,
      spaceName: result.name,
    });

    const message =
      delivery.status === "sent"
        ? "Invitation envoyée."
        : delivery.status === "not_configured"
          ? "Invitation créée. L’envoi email n’est pas configuré : partagez le lien ci-dessous."
          : "Invitation créée, mais l’email n’a pas pu être envoyé. Partagez le lien ci-dessous.";

    return data<ActionData>(
      { success: true, message, inviteUrl, delivery: delivery.status },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AuthorizationChangedError) {
      return data<ActionData>(
        { message: "Vos droits d’administration ont changé. Rechargez la page." },
        { status: 403 }
      );
    }
    if (error instanceof AlreadyMemberError) {
      return data<ActionData>(
        { message: "Cette personne appartient déjà à cet espace." },
        { status: 409 }
      );
    }
    if (error instanceof Response) throw error;

    logServerException(error, {
      operation: "space.mutate",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return data<ActionData>(
      { message: "Impossible de créer l’invitation." },
      { status: 500 }
    );
  }
}

export default function SpaceManagementPage() {
  const {
    space,
    role,
    isAdmin,
    isSuperAdmin,
    members,
    memberPage,
    memberQuery,
    memberRole,
    memberTotal,
    memberTotalPages,
    activeMembersSevenDays,
    invites,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "EDITOR" },
  });
  const memberPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (memberQuery) params.set("memberQ", memberQuery);
    if (memberRole) params.set("memberRole", memberRole);
    params.set("memberPage", String(targetPage));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">{space.name}</h1>
        <p className="text-sm text-muted-foreground">
          {space.description || "Aucune description."} · Votre rôle : {role}
        </p>
      </div>

      {!isAdmin ? (
        <Alert>
          <AlertTitle>Espace privé</AlertTitle>
          <AlertDescription>
            La gestion des membres et des invitations est réservée aux administrateurs.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Inviter une personne</CardTitle></CardHeader>
            <CardContent>
              <RouterForm method="post" className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...form.register("email")}
                  />
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email?.message || actionData?.errors?.email?.[0]}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rôle</Label>
                  <select
                    id="role"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    {...form.register("role")}
                  >
                    <option value="READ_ONLY">Lecture seule</option>
                    <option value="EDITOR">Éditeur</option>
                    <option value="MODERATOR">Modérateur</option>
                    <option value="ADMIN">Administrateur (Super Admin)</option>
                  </select>
                </div>
                <Button className="self-end" type="submit" disabled={navigation.state !== "idle"}>
                  {navigation.state === "submitting" ? "Création…" : "Créer l’invitation"}
                </Button>
              </RouterForm>

              {actionData && (
                <Alert className="mt-4" variant={actionData.success ? "default" : "destructive"}>
                  <AlertTitle>{actionData.success ? "Invitation prête" : "Erreur"}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{actionData.message}</p>
                    {actionData.inviteUrl && (
                      <Input aria-label="Lien d’invitation" readOnly value={actionData.inviteUrl} />
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membres ({memberTotal})</CardTitle>
              <p className="text-sm text-muted-foreground">{activeMembersSevenDays} membre(s) actif(s) ces 7 derniers jours dans cet espace.</p>
              <p className="text-xs text-muted-foreground">Dernière consultation enregistrée au jour UTC, sans heure ni historique de navigation. Le compteur est indépendant des filtres du tableau.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <RouterForm className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_auto]" method="get">
                <Input aria-label="Rechercher un membre" defaultValue={memberQuery} maxLength={100} name="memberQ" placeholder="Nom ou email" />
                <select aria-label="Rôle du membre" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" defaultValue={memberRole} name="memberRole">
                  <option value="">Tous les rôles</option>
                  <option value="READ_ONLY">Lecture seule</option>
                  <option value="EDITOR">Éditeur</option>
                  <option value="MODERATOR">Modérateur</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
                <Button type="submit" variant="outline">Filtrer</Button>
              </RouterForm>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left"><th className="py-2">Nom</th><th>Email</th><th>Rôle</th><th>Inscription</th><th>Dernière activité (UTC)</th><th>Actions</th></tr></thead>
                <tbody>
                  {members.map((membership) => (
                    <tr className="border-b" key={membership.user.id}>
                      <td className="py-2">{membership.user.firstName} {membership.user.lastName}</td>
                      <td>{membership.user.email}</td>
                      <td>{membership.role}</td>
                      <td>{new Date(membership.joinedAt).toLocaleDateString("fr-FR")}</td>
                      <td>{activityDayLabel(membership.activity?.lastActiveDay)}</td>
                      <td className="py-2">
                        <MemberAdminActions
                          currentRole={membership.role}
                          isSuperAdmin={isSuperAdmin}
                          memberName={`${membership.user.firstName} ${membership.user.lastName}`}
                          spaceId={space.id}
                          userId={membership.user.id}
                        />
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && <tr><td className="py-8 text-center text-muted-foreground" colSpan={6}>Aucun membre trouvé.</td></tr>}
                </tbody>
              </table>
              <div className="mt-4 flex items-center justify-between">
                <Button asChild disabled={memberPage <= 1} size="sm" variant="outline"><Link aria-disabled={memberPage <= 1} to={memberPageUrl(Math.max(1, memberPage - 1))}>Précédent</Link></Button>
                <span className="text-sm text-muted-foreground">Page {memberPage} sur {memberTotalPages}</span>
                <Button asChild disabled={memberPage >= memberTotalPages} size="sm" variant="outline"><Link aria-disabled={memberPage >= memberTotalPages} to={memberPageUrl(Math.min(memberTotalPages, memberPage + 1))}>Suivant</Link></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Invitations récentes</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left"><th className="py-2">Email</th><th>Rôle</th><th>Statut</th><th>Expiration</th></tr></thead>
                <tbody>
                  {invites.map((invite) => {
                    const status = invite.isUsed
                      ? "Acceptée"
                      : new Date(invite.expiresAt) <= new Date()
                        ? "Expirée"
                        : "En attente";
                    return (
                      <tr className="border-b" key={invite.id}>
                        <td className="py-2">{invite.email}</td>
                        <td>{invite.roleToAssign}</td>
                        <td>{status}</td>
                        <td>{new Date(invite.expiresAt).toLocaleString("fr-FR")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
