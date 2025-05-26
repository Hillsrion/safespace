import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form as RemixForm, useActionData } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/ui/form';
import { createSpaceSchema } from '~/lib/schemas/spaceSchemas';

import { action, type ActionData } from './action.server';
import { FormAlert } from '~/components/ui/form-alert';
import { loginRedirect } from '~/lib/redirects';

export async function loader({ request }: { request: Request }) {
  return loginRedirect(request);
}

export { action };

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
  const actionData = useActionData<ActionData>();
  const form = useCreateSpaceForm();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Créer un nouvel espace</h1>
        <p className="text-sm text-muted-foreground">
          Configurez un nouvel espace de travail pour votre équipe
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Nouvel espace</CardTitle>
        </CardHeader>
        <CardContent>
          <RemixForm method="post" className="space-y-6">
            <Form {...form}>
            {actionData?.errors && (
              <FormAlert
                type="error"
                errors={actionData.errors}
              />
            )}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="name">Nom de l'espace</FormLabel>
                <FormControl>
                  <Input id="name" placeholder="Entrez le nom de l'espace" {...field} />
                </FormControl>
                <FormMessage>
                  {actionData?.errors?.name?.[0]}
                </FormMessage>
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
                <FormMessage>
                  {actionData?.errors?.description?.[0]}
                </FormMessage>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Créer l'espace
          </Button>
          </Form>
        </RemixForm>
        </CardContent>
      </Card>
    </div>
  );
}
