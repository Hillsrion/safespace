import { Form as RemixForm, Link, useLoaderData } from "react-router";
import { Check, HelpCircle, AlertCircle, CheckCircle } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { checkPasswordRequirements } from "~/lib/password";
import { useAccount } from "~/hooks/useAccount";
import { action } from "./action";
import { loader } from "./loader";

export { action, loader };

export const handle = {
  crumb: "Mon compte"
};

export default function AccountPage() {
  const { form, actionData } = useAccount();
  const user = useLoaderData<typeof loader>();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres du compte</h1>
        <p className="text-sm text-muted-foreground">
          Mettez à jour vos informations personnelles et votre mot de passe
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          {actionData?.success && (
            <Alert className="mb-4 bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Succès</AlertTitle>
              <AlertDescription className="text-green-700">
                Votre compte a été mis à jour avec succès.
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

          <Form {...form}>
            <RemixForm 
              method="post" 
              className="space-y-4"
              onSubmit={async (e) => {
                const form = e.currentTarget;
                const formData = new FormData(form);
                
                // Check if any password field has a value
                const hasPasswordFields = 
                  formData.get('currentPassword') || 
                  formData.get('newPassword') || 
                  formData.get('confirmPassword');
                
                if (!hasPasswordFields) {
                  // Remove password fields if none are filled out
                  formData.delete('currentPassword');
                  formData.delete('newPassword');
                  formData.delete('confirmPassword');
                } else {
                  // If any password field is filled, ensure all are included
                  // The server will validate that all required fields are present
                  if (!formData.get('currentPassword')) formData.set('currentPassword', '');
                  if (!formData.get('newPassword')) formData.set('newPassword', '');
                  if (!formData.get('confirmPassword')) formData.set('confirmPassword', '');
                }
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prénom</FormLabel>
                      <FormControl>
                        <Input placeholder="Jean" {...field} />
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
                      <FormLabel>Nom</FormLabel>
                      <FormControl>
                        <Input placeholder="Dupont" {...field} />
                      </FormControl>
                      <FormMessage>
                        {actionData?.errors?.fieldErrors?.lastName?.[0]}
                      </FormMessage>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="prenom@exemple.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage>
                      {actionData?.errors?.fieldErrors?.email?.[0]}
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
                      <Input
                        placeholder="@utilisateur"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage>
                      {actionData?.errors?.fieldErrors?.instagram?.[0]}
                    </FormMessage>
                  </FormItem>
                )}
              />

              <div className="pt-6 border-t mt-6">
                <h3 className="text-lg font-medium mb-0.5">Changer le mot de passe</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Laissez ces champs vides pour conserver votre mot de passe actuel.
                </p>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mot de passe actuel</FormLabel>
                        <FormControl>
                          <PasswordInput
                            field={field}
                            placeholder="Entrez votre mot de passe actuel"
                          />
                        </FormControl>
                        <FormMessage>
                          {actionData?.errors?.fieldErrors?.currentPassword?.[0]}
                        </FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>Nouveau mot de passe</FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-4 h-4 text-gray-500 hover:text-gray-700 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-gray-600 mb-3">Exigences du mot de passe :</p>
                                <div className="space-y-2">
                                  {checkPasswordRequirements(
                                    field.value || ""
                                  ).map((requirement, index) => (
                                    <div
                                      key={index}
                                      className="flex items-center gap-3"
                                    >
                                      <span
                                        className={cn(
                                          "rounded-full flex items-center justify-center transition-colors duration-300",
                                          requirement.valid
                                            ? "bg-green-500"
                                            : "bg-gray-300"
                                        )}
                                      >
                                        <Check className="w-3 h-3 text-white" />
                                      </span>
                                      <span
                                        className={cn(
                                          "text-xs transition-colors duration-300",
                                          requirement.valid
                                            ? "text-green-700"
                                            : "text-gray-500"
                                        )}
                                      >
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
                            placeholder="Entrez votre nouveau mot de passe"
                          />
                        </FormControl>
                        <FormMessage>
                          {actionData?.errors?.fieldErrors?.newPassword?.[0]}
                        </FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmer le nouveau mot de passe</FormLabel>
                        <FormControl>
                          <PasswordInput
                            field={field}
                            placeholder="Confirmez votre nouveau mot de passe"
                          />
                        </FormControl>
                        <FormMessage>
                          {actionData?.errors?.fieldErrors?.confirmPassword?.[0]}
                        </FormMessage>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit">Enregistrer les modifications</Button>
              </div>
            </RemixForm>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
