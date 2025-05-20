import { redirect } from "@remix-run/node";
import { Form as RemixForm, Link } from "react-router";
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
import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import {
  checkPasswordRequirements,
  type PasswordRequirement,
} from "~/lib/password";
import { getSession } from "~/services/session.server";
import { useRegister } from "~/hooks/useRegister";
import { action as registerAction } from "../register/action";

export async function action({ request }: { request: Request }) {
  return await registerAction({ request });
}

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  const user = session.get("user");
  if (user) return redirect("/dashboard");
  return null;
}

export default function Register() {
  const { form, actionData } = useRegister();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-md mx-auto">
          <div className="flex flex-col items-center justify-center p-6">
            <h2 className="text-2xl font-bold tracking-tight">Register</h2>
            <p className="text-sm text-muted-foreground mt-1">Create your account</p>
          </div>
          <CardContent>
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

                <Button type="submit" className="w-full mt-6">
                  Register
                </Button>
              </RemixForm>
            </Form>

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