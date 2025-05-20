import { redirect } from "@remix-run/node";
import { Form as RemixForm, Link, useLoaderData } from "react-router";
import { AlertCircle } from "lucide-react";
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
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { getSession, getError } from "~/services/session.server";
import { useLogin } from "~/hooks/useLogin";
import { action as loginAction } from "../login/action";

export async function action({ request }: { request: Request }) {
  return await loginAction({ request });
}

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  const user = session.get("user");
  if (user) return redirect("/dashboard");
  const error = await getError(request);
  return { error };
}

export default function Login() {
  const { form, actionData } = useLogin();
  const loaderData = useLoaderData<typeof loader>();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-md mx-auto">
          <div className="flex flex-col items-center justify-center p-6">
            <h2 className="text-2xl font-bold tracking-tight">Log in</h2>
            <p className="text-sm text-muted-foreground mt-1">Log in to your account</p>
          </div>
          <CardContent>
            {loaderData?.error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{loaderData.error}</AlertDescription>
              </Alert>
            )}
            {actionData?.errors?.formErrors?.map((error, index) => (
              <Alert key={index} variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ))}
            <Form {...form}>
              <RemixForm method="post" className="space-y-4">

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
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
                      <FormLabel>Password</FormLabel>
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

                <Button type="submit" className="w-full mt-6">
                  Log in
                </Button>
              </RemixForm>
            </Form>

            <p className="text-center text-sm mt-3">
              Don't have an account?{" "}
              <Link to="/auth/register" className="text-blue-500 hover:underline">
                Register
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
