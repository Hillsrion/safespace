import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form as RemixForm, useActionData } from '@remix-run/react';
// ActionFunctionArgs, json, redirect are removed as action is now imported

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
// Label import was present but not used directly in the provided snippet, keeping it for now.
import { Label } from '~/components/ui/label';
import {
  // Form (shadcn) is imported but not used directly, FormField uses it.
  FormControl,
  // FormDescription is imported but not used directly.
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/ui/form';
import { createSpaceSchema } from '~/lib/schemas/spaceSchemas';
// getCurrentUser, prisma, getSession, commitSession are removed as they are used in the separated action.

// Import the action from the new file and its associated type
import { action, type ActionData } from './action.server';

export { action }; // Re-export the action

// Define the custom hook
function useCreateSpaceForm() {
  return useForm<z.infer<typeof createSpaceSchema>>({
    resolver: zodResolver(createSpaceSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });
}

export default function CreateSpacePage() {
  const actionData = useActionData<ActionData>(); // Use imported ActionData type
  const form = useCreateSpaceForm();

  // React Hook Form's handleSubmit will validate your inputs before calling onSubmit
  // The actual submission to the backend is handled by Remix's <Form method="post">
  // so we don't need an explicit onSubmit handler here if we're just using Remix's action.
  // function onSubmit(values: z.infer<typeof createSpaceSchema>) {
  //   // This console.log is mostly for client-side debugging if needed.
  //   // The actual data submission is via the Remix Form.
  //   console.log('Valeurs soumises (côté client):', values);
  // }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6">Créer un nouvel espace</h1>
      {/* FormProvider removed */}
      {/* Use RemixForm and rename it to avoid conflict with shadcn Form */}
      <RemixForm method="post" className="space-y-6" onSubmit={(event) => {
        // We need to manually trigger RHF validation before Remix submits
          // This is because Remix's Form doesn't automatically integrate with RHF's onSubmit
          // when we want to use RHF for client-side validation display.
          form.handleSubmit(() => {
            // If validation passes, this callback is executed.
            // We don't need to do anything here as Remix will handle the actual submission.
          })(event); // Pass the event to RHF's handleSubmit
        }}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="name">Nom de l'espace</FormLabel>
                <FormControl>
                  <Input id="name" placeholder="Entrez le nom de l'espace" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="description">Description</FormLabel>
                <FormControl>
                  <Textarea
                    id="description"
                    placeholder="Entrez une description pour l'espace (optionnel)"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {actionData?.message && !actionData.errors && (
            <p className="text-sm font-medium text-green-600">{actionData.message}</p>
          )}
          {actionData?.message && actionData.errors && (
             <p className="text-sm font-medium text-red-600">{actionData.message}</p>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Créer l'espace
          </Button>
        </RemixForm>
      {/* FormProvider removed */}
    </div>
  );
}
