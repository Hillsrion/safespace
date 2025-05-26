import { type ActionFunctionArgs, data, redirect } from "@remix-run/node";

import {
  parseFormData,
  type File as MJacksonFile,
} from "@mjackson/form-data-parser";
import { R2FileStorage } from "@edgefirst-dev/r2-file-storage";

import { getSession, commitSession } from "~/services/session.server";
import { getCurrentUser } from "~/services/auth.server";
import { createPost } from "~/db/repositories/posts/queries.server";

import { z } from "zod";
import { PostSeverity } from "~/generated/prisma/client"; // Adjusted path assuming root is `~`
import type { R2Bucket } from "@cloudflare/workers-types";

// Zod Schemas
const fileMetadataSchema = z.object({
  key: z.string().min(1, "La clé du fichier est requise."),
  name: z.string().min(1, "Le nom du fichier est requis."),
  type: z
    .string()
    .regex(
      /^image\/(jpeg|png|gif|webp)$/,
      "Type de fichier image invalide (JPG, PNG, GIF, WEBP)."
    ),
  size: z
    .number()
    .positive("La taille du fichier doit être positive.")
    .max(10 * 1024 * 1024, "Chaque fichier ne doit pas dépasser 10MB."),
});

const createPostSchema = z.object({
  name: z
    .string()
    .min(3, "Le nom du mis en cause doit comporter au moins 3 caractères."),
  instagramHandle: z
    .string()
    .min(3, "Le compte Instagram doit comporter au moins 3 caractères.")
    .startsWith("@", "Le compte Instagram doit commencer par @."),
  description: z
    .string()
    .min(10, "La description des faits doit comporter au moins 10 caractères."),
  severity: z.nativeEnum(PostSeverity, {
    errorMap: () => ({ message: "Niveau de sévérité invalide." }),
  }),
  postAnonymously: z.preprocess(
    (value) => value === "on" || value === true,
    z.boolean()
  ),
  adminOnly: z.preprocess(
    (value) => value === "on" || value === true,
    z.boolean()
  ),
  evidenceFiles: z.array(fileMetadataSchema).optional().default([]),
});

const MAX_FILE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

interface UploadedEvidenceDetails {
  key: string;
  name: string;
  type: string;
  size: number;
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const R2_BINDING_NAME = "R2_BUCKET";
  const r2Binding = context.cloudflare.env[R2_BINDING_NAME] as
    | R2Bucket
    | undefined;

  if (!r2Binding) {
    console.error("R2_BUCKET binding not found in Cloudflare context.");
    return data(
      {
        errors: {
          form: "Configuration de stockage de fichiers manquante côté serveur.",
        },
      },
      { status: 500 }
    );
  }
  const storage = new R2FileStorage(r2Binding);

  const handleFileUpload = async (
    fileInfo: MJacksonFile
  ): Promise<UploadedEvidenceDetails | null> => {
    if (fileInfo.name !== "evidenceFile" || !fileInfo.filename) {
      return null;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(fileInfo.contentType)) {
      throw new Error(
        `Type de fichier non supporté: ${fileInfo.contentType}. Types acceptés: JPG, PNG, GIF, WEBP.`
      );
    }

    const chunks = [];
    let currentSize = 0;
    for await (const chunk of fileInfo.data) {
      currentSize += chunk.length;
      if (currentSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new Error(
          `Fichier trop volumineux. Taille max: ${MAX_FILE_SIZE_MB}MB.`
        );
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const file = new File([buffer], fileInfo.filename, {
      type: fileInfo.contentType,
    });
    const r2Key = `posts/evidence/${Date.now()}-${fileInfo.filename}`;

    try {
      await storage.put(r2Key, file, {
        httpMetadata: { contentType: file.type },
      });

      return {
        key: r2Key,
        name: file.name,
        type: file.type,
        size: file.size,
      };
    } catch (uploadError: any) {
      console.error(
        "R2 Upload Error with @edgefirst-dev/r2-file-storage:",
        uploadError
      );
      throw new Error(
        `Échec du téléversement du fichier vers R2: ${uploadError.message}`
      );
    }
  };

  const evidenceFilesMetaData: UploadedEvidenceDetails[] = [];
  let formData;

  try {
    formData = await parseFormData(request, {
      handleFile: async (file) => {
        if (file.name === "evidenceFile") {
          const result = await handleFileUpload(file);
          if (result) {
            evidenceFilesMetaData.push(result);
          }
          return undefined;
        }
        return undefined;
      },
    });
  } catch (error: any) {
    console.error("Form parsing or file upload error:", error);
    if (evidenceFilesMetaData.length > 0) {
      console.warn(
        `Error during form processing after ${evidenceFilesMetaData.length} file(s) uploaded to R2. Orphaned files:`,
        evidenceFilesMetaData.map((f) => f.key)
      );
    }
    return data(
      {
        errors: {
          form:
            error.message ||
            "Erreur lors du traitement du formulaire ou du téléversement.",
        },
      },
      { status: 400 }
    );
  }

  const rawName = formData.get("name") as string;
  const rawInstagramHandle = formData.get("instagramHandle") as string;
  const rawDescription = formData.get("description") as string;
  const rawSeverity = formData.get("severity") as string;
  const rawPostAnonymously = formData.get("postAnonymously") as string;
  const rawAdminOnly = formData.get("adminOnly") as string;

  const objectToValidate = {
    name: rawName,
    instagramHandle: rawInstagramHandle,
    description: rawDescription,
    severity: rawSeverity,
    postAnonymously: rawPostAnonymously,
    adminOnly: rawAdminOnly,
    evidenceFiles: evidenceFilesMetaData,
  };

  const validationResult = createPostSchema.safeParse(objectToValidate);

  if (!validationResult.success) {
    if (evidenceFilesMetaData.length > 0) {
      console.warn(
        `Zod validation failed after ${evidenceFilesMetaData.length} file(s) were uploaded to R2. ` +
          `Orphaned files: ${evidenceFilesMetaData
            .map((f) => f.key)
            .join(", ")}. Errors:`,
        validationResult.error.flatten().fieldErrors
      );
    }
    return data(
      {
        errors: validationResult.error.flatten().fieldErrors,
        submittedValues: objectToValidate,
      },
      { status: 400 }
    );
  }

  const validatedData = validationResult.data;
  const currentUser = await getCurrentUser(request);
  const actualUserId = currentUser?.id || null;
  const spaceId = "hardcoded-space-id-for-testing";

  if (spaceId === "hardcoded-space-id-for-testing") {
    console.warn(
      "Using hardcoded spaceId for post creation. Replace with actual space selection logic."
    );
  }
  if (!actualUserId && !validatedData.postAnonymously) {
    return data(
      {
        errors: {
          form: "Vous devez être connecté pour créer un post non anonyme.",
        },
      },
      { status: 403 }
    );
  }

  try {
    const newPost = await createPost({
      name: validatedData.name,
      instagramHandle: validatedData.instagramHandle,
      description: validatedData.description,
      severity: validatedData.severity,
      isAnonymous: validatedData.postAnonymously,
      isAdminOnly: validatedData.adminOnly,
      authorId: validatedData.postAnonymously ? null : actualUserId,
      spaceId: spaceId,
      evidence: validatedData.evidenceFiles?.map((ef) => ({
        filePath: ef.key,
        fileName: ef.name,
        mimeType: ef.type,
        fileSize: ef.size,
      })),
    });

    const session = await getSession(request);
    session.flash("toast", {
      title: `Création de post`,
      message: `Post "${newPost.id.substring(
        0,
        8
      )}..." créé avec succès (multi-file R2) !`,
      type: "success",
    });

    return redirect("/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (dbError: any) {
    console.error("Post creation failed (DB):", dbError);
    if (validatedData.evidenceFiles && validatedData.evidenceFiles.length > 0) {
      const uploadedKeys = validatedData.evidenceFiles
        .map((f) => f.key)
        .join(", ");
      console.warn(
        `DB error after uploading files to R2. Orphaned files: ${uploadedKeys}. Consider implementing deletion.`
      );
    }
    return data(
      {
        errors: {
          form: `La création du post a échoué: ${
            dbError.message || "Erreur de base de données."
          }`,
        },
        submittedValues: objectToValidate,
      },
      { status: 500 }
    );
  }
};
