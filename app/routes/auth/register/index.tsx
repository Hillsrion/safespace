import { redirect } from "react-router";
import { Form as RemixForm, Link, useLoaderData } from "react-router";
import { Check, HelpCircle, AlertCircle } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Input } from "~/components/ui/input";
import { PasswordInput } from "~/components/ui/password-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import {
  checkPasswordRequirements,
  type PasswordRequirement,
} from "~/lib/password";
import { getCurrentUser } from "~/services/auth.server";
import { prisma } from "~/db/client.server";
import { useRegister } from "~/hooks/useRegister";
import { action as registerAction } from "../register/action";
import { getInviteTokenCandidates } from "~/lib/invite-token.server";
import { runWithDbContext } from "~/db/context.server";
import { CommunityPolicy } from "~/components/community-policy";

export async function action({ request }: { request: Request }) {
  return await registerAction({ request });
}

export async function loader({ request }: { request: Request }) {
  const user = await getCurrentUser(request);

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) {
    if (user) return redirect("/dashboard");
    return { invite: null, token: "", signedIn: false };
  }

  const inviteTokens = getInviteTokenCandidates(token);
  const invite = await runWithDbContext(
    { mode: "registration", email: "", inviteTokens },
    () =>
      prisma.invite.findFirst({
        where: { token: { in: inviteTokens } },
        select: {
          email: true,
          roleToAssign: true,
          expiresAt: true,
          isUsed: true,
          space: { select: { name: true } },
        },
      })
  );

  const isValid = Boolean(
    invite && !invite.isUsed && invite.expiresAt > new Date() &&
      (!user || user.email.toLowerCase() === invite.email.toLowerCase())
  );

  return {
    invite: isValid
      ? {
          email: invite!.email,
          role: invite!.roleToAssign,
          spaceName: invite!.space.name,
          expiresAt: invite!.expiresAt.toISOString(),
        }
      : null,
    token: isValid ? token : "",
    signedIn: Boolean(user),
  };
}

export default function Register() {
  const { invite, token, signedIn } = useLoaderData<typeof loader>();
  const { form, actionData } = useRegister(invite?.email ?? "", token);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-md mx-auto">
          <div className="flex flex-col items-center justify-center p-6">
            <h2 className="text-2xl font-bold tracking-tight">{signedIn ? "Join a space" : "Register"}</h2>
            <p className="text-sm text-muted-foreground mt-1">{signedIn ? "Accept your invitation" : "Create your account or join with an existing one"}</p>
          </div>
          <CardContent>
            {!invite ? (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Invitation required</AlertTitle>
                <AlertDescription>
                  This registration link is missing, invalid, expired, or already used.
                  Ask a space administrator for a new invitation.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="mb-4">
                <AlertTitle>Invitation to {invite.spaceName}</AlertTitle>
                <AlertDescription>
                  You are joining as {invite.role}. This invitation is reserved for {invite.email}.
                </AlertDescription>
              </Alert>
            )}
            {actionData?.errors?.formErrors?.map((error, index) => (
              <Alert key={index} variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ))}
            {!signedIn && <Form {...form}>
              <RemixForm method="post" className="space-y-4">
                <input type="hidden" {...form.register("inviteToken")} />
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.firstName?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.lastName?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instagram"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram</FormLabel>
                      <FormControl>
                        <Input placeholder="@john_doe" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.instagram?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.email?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel>Password *</FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-4 h-4 text-gray-500 hover:text-gray-700 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-gray-600 mb-3">Password requirements:</p>
                              <div className="space-y-2">
                                {checkPasswordRequirements(field.value).map((requirement: PasswordRequirement, index: number) => (
                                  <div key={index} className="flex items-center gap-3">
                                    <span className={cn(
                                      "rounded-full flex items-center justify-center transition-colors duration-300",
                                      requirement.valid ? 'bg-green-500' : 'bg-gray-300'
                                    )}>
                                      <Check className="w-4 h-4 text-white" />
                                    </span>
                                    <span className={cn(
                                      "font-medium transition-colors duration-300",
                                      requirement.valid ? 'text-green-700' : 'text-gray-500'
                                    )}>
                                      {requirement.message}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <PasswordInput
                          field={field}
                          placeholder="Enter your password"
                        />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.password?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password *</FormLabel>
                      <FormControl>
                        <PasswordInput
                          field={field}
                          placeholder="Confirm your password"
                        />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.confirmPassword?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="codeOfConductAccepted"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-md border p-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          name={field.name}
                        />
                      </FormControl>
                      <div>
                        <FormLabel>I accept the Code of Conduct *</FormLabel>
                        <p className="text-xs text-muted-foreground mt-1">
                          Read the rules below before accepting. <Link to="/community-policy" target="_blank" rel="noopener noreferrer" className="underline">Open the full policy in a new tab</Link>.
                        </p>
                        <FormMessage>
                          {actionData?.errors?.fieldErrors?.codeOfConductAccepted?.[0]}
                        </FormMessage>
                      </div>
                    </FormItem>
                  )}
                />

                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Read the Code of Conduct and content rules</summary>
                  <div className="mt-4"><CommunityPolicy /></div>
                </details>

                <Button type="submit" className="w-full mt-6" disabled={!invite}>
                  Register
                </Button>
              </RemixForm>
            </Form>}

            {invite && <section className="mt-6 border-t pt-4 space-y-4" aria-label="Accept with an existing account">
              <h3 className="font-medium">{signedIn ? "Rejoindre cet espace" : "Vous avez déjà un compte ?"}</h3>
              <RemixForm method="post" className="space-y-4">
                <input type="hidden" name="intent" value="accept-invite" />
                <input type="hidden" name="inviteToken" value={token} />
                {!signedIn && <>
                  <label className="block text-sm" htmlFor="existing-email">Email du compte</label>
                  <Input id="existing-email" name="email" type="email" autoComplete="username" defaultValue={invite.email} required />
                  <label className="block text-sm" htmlFor="existing-password">Mot de passe du compte</label>
                  <Input id="existing-password" name="password" type="password" autoComplete="current-password" required />
                </>}
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="codeOfConductAccepted" required className="mt-1" />
                  <span>J’accepte la <Link className="underline" to="/community-policy" target="_blank" rel="noopener noreferrer">charte de conduite et les règles de publication</Link>.</span>
                </label>
                <Button type="submit">{signedIn ? "Accepter l’invitation" : "Se connecter et accepter l’invitation"}</Button>
              </RemixForm>
            </section>}

            <p className="text-center text-sm mt-3">
              Already have an account?{" "}
              <Link to="/auth/login" className="text-blue-500 hover:underline">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
