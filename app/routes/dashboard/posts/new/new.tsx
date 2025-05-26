import React, { useEffect, useRef } from 'react';
import { Form as RemixForm, useActionData } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  Form, // Project's RHF-compatible Form wrapper
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form"; // Based on AccountPage
import { ComboboxTextfield, Person } from '~/components/ui/combobox-textfield';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';
// Input from ~/components/ui/input is used by FormField in AccountPage, not directly here unless FormField requires it
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import { PostSeverity } from '~/generated/prisma';
import ImageUpload, { type ImageUploadRef } from '~/components/ui/image-upload'; 

// Client-side schema for react-hook-form.
// evidenceFiles will be File[] from ImageUpload, then converted to metadata on server.
const createPostSchemaClient = z.object({
  name: z.string().min(3, "Le nom du mis en cause doit comporter au moins 3 caractères."),
  instagramHandle: z.string()
    .min(3, "Le compte Instagram doit comporter au moins 3 caractères.")
    .startsWith('@', "Le compte Instagram doit commencer par @."),
  description: z.string().min(10, "La description des faits doit comporter au moins 10 caractères."),
  severity: z.nativeEnum(PostSeverity, { errorMap: () => ({ message: "Niveau de sévérité invalide."}) }),
  postAnonymously: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
  evidenceFiles: z.array(z.instanceof(File)) // Client-side, we have File objects
    .optional().default([])
    .refine(files => files.every(file => file.size <= 10 * 1024 * 1024), `Chaque fichier ne doit pas dépasser 10MB.`)
    .refine(files => files.every(file => /^image\/(jpeg|png|gif|webp)$/.test(file.type)), "Type de fichier image invalide (JPG, PNG, GIF, WEBP)."),
});

const mockPeople: Person[] = [
  { id: 1, name: 'Alice Wonderland', instagram: '@alice_in_wonderland' },
  { id: 2, name: 'Bob The Builder', instagram: '@bob_builds' },
  { id: 3, name: 'Charlie Brown', instagram: '@charlie_goodgrief' },
];

export default function CreatePostPage() {
  const actionData = useActionData<typeof import('~/routes/posts/new/action.server').action>();
  const imageUploadRef = useRef<ImageUploadRef>(null);

  const form = useForm<z.infer<typeof createPostSchemaClient>>({
    resolver: zodResolver(createPostSchemaClient),
    defaultValues: {
      name: actionData?.submittedValues?.name || "",
      instagramHandle: actionData?.submittedValues?.instagramHandle || "",
      description: actionData?.submittedValues?.description || "",
      severity: (actionData?.submittedValues?.severity as PostSeverity) || PostSeverity.medium,
      postAnonymously: actionData?.submittedValues?.postAnonymously === 'on' || false,
      adminOnly: actionData?.submittedValues?.adminOnly === 'on' || false,
      evidenceFiles: [], // File inputs cannot be repopulated for security
    },
  });

  useEffect(() => {
    if (actionData?.errors) {
      Object.entries(actionData.errors).forEach(([key, value]) => {
        if (key !== 'form' && key !=='evidenceFiles' && value) { 
          form.setError(key as keyof z.infer<typeof createPostSchemaClient>, {
            type: 'server',
            message: Array.isArray(value) ? value.join(', ') : String(value),
          });
        }
        if (key === 'evidenceFiles' && value) {
            form.setError('evidenceFiles', {
                type: 'server',
                message: Array.isArray(value) ? value.join(', ') : String(value)
            });
        }
      });
    }
    // If actionData indicates success (no errors, no submittedValues, and potentially a success flag if not redirecting)
    // This logic might need adjustment based on how success is signaled if not redirecting.
    // With a redirect, this component instance would be fresh anyway.
    if (actionData && !actionData.errors && !actionData.submittedValues && (actionData as any).success) { 
        form.reset(); // Reset RHF state
        imageUploadRef.current?.clear(); // Clear ImageUpload component
    }

  }, [actionData, form]);

  const handleNameSelect = (person: Person | null) => {
    if (person) {
      form.setValue('name', person.name, { shouldValidate: true });
      if (!form.getValues('instagramHandle')) {
        form.setValue('instagramHandle', person.instagram, { shouldValidate: true });
      }
    }
  };

  const handleInstagramSelect = (person: Person | null) => {
    if (person) {
      form.setValue('instagramHandle', person.instagram, { shouldValidate: true });
      if (!form.getValues('name')) {
        form.setValue('name', person.name, { shouldValidate: true });
      }
    }
  };
  
  const getSeverityLabel = (sev: PostSeverity) => {
    switch (sev) {
      case PostSeverity.low: return "Bas";
      case PostSeverity.medium: return "Moyen";
      case PostSeverity.high: return "Haut";
      case PostSeverity.very_high: return "Très Haut"; // Updated to very_high
      default: return sev;
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-center">Créer un nouveau post</h1>
      {actionData?.errors?.form && (
        <div className="mb-4 p-3 rounded-md bg-red-100 text-red-700 border border-red-300">
          {Array.isArray(actionData.errors.form) ? actionData.errors.form.join(', ') : actionData.errors.form}
        </div>
      )}
      <Form {...form}> 
        <RemixForm method="POST" encType="multipart/form-data" action="/actions/posts/create" className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom du mis en cause <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <ComboboxTextfield
                    peopleData={mockPeople}
                    value={field.value || ''} 
                    onChange={(value) => {
                        field.onChange(value); 
                        if (form.getValues('instagramHandle') && !mockPeople.some(p => p.name === value && p.instagram === form.getValues('instagramHandle'))) {
                           // Optional: Clear related field if consistency is broken by manual text edit
                        }
                    }}
                    onSelect={(person) => {
                      handleNameSelect(person);
                      // field.onChange(person ? person.name : ''); // RHF field is updated by form.setValue in handleNameSelect
                    }}
                    placeholder="Rechercher ou taper un nom..."
                    searchType="name"
                    showConfirmation={true}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Hidden input for name is removed as RHF controls the field's value through FormField */}

          <FormField
            control={form.control}
            name="instagramHandle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compte Instagram <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <ComboboxTextfield
                    peopleData={mockPeople}
                    value={field.value || ''}
                    onChange={field.onChange}
                    onSelect={(person) => {
                      handleInstagramSelect(person);
                      // field.onChange(person ? person.instagram : '');
                    }}
                    placeholder="Rechercher ou taper un compte Instagram..."
                    searchType="instagram"
                    showConfirmation={false}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Hidden input for instagramHandle is removed */}

          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Niveau de sévérité <span className="text-red-500">*</span></FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger id="severity-select" name="severity">
                      <SelectValue placeholder="Sélectionner un niveau de sévérité" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(PostSeverity).map((level) => (
                      <SelectItem key={level} value={level}>
                        {getSeverityLabel(level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Hidden input for severity is removed */}

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description des faits <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    id="description" 
                    name="description" 
                    placeholder="Décrivez les faits, dates, lieux, liens vers preuves..."
                    rows={6}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        
          <FormField
            control={form.control}
            name="evidenceFiles"
            render={({ field }) => ( 
              <FormItem>
                <FormLabel>Pièce justificative (image, max 10MB)</FormLabel>
                <FormControl>
                  <ImageUpload
                    ref={imageUploadRef}
                    id="evidence-upload"
                    name="evidenceFile" // HTML name for file input parts for parser
                    onFileChange={field.onChange} // RHF's onChange for File[]
                    maxSizeMB={10}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="postAnonymously"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <FormLabel htmlFor="post-anonymously-switch" className="cursor-pointer">
                  Poster anonymement
                </FormLabel>
                <FormControl>
                  <Switch
                    id="post-anonymously-switch"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    name="postAnonymously" 
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="adminOnly"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <FormLabel htmlFor="admin-only-switch" className="cursor-pointer">
                  Visible uniquement par les administrateurs
                </FormLabel>
                <FormControl>
                  <Switch
                    id="admin-only-switch"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    name="adminOnly"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Création en cours..." : "Créer le post"}
            </Button>
          </div>
        </RemixForm>
      </Form>
    </div>
  );
}
