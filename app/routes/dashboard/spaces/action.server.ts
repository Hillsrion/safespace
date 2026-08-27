import { type ActionFunctionArgs, data, redirect } from "react-router";

import { createSpaceSchema } from "~/lib/schemas/spaceSchemas";
import { getCurrentUser } from "~/services/auth.server";
import { getSession, commitSession } from "~/services/session.server";
import {
  createSpaceWithAdmin,
} from "~/db/repositories/spaces/queries.server";
import { requireSameOrigin } from "~/lib/security.server";
import { logServerException } from "~/lib/error/server-error.server";

export type ActionData = {
  errors?: {
    name?: string[];
    description?: string[];
  };
  message?: string;
};

export async function action({ request }: ActionFunctionArgs) {
  requireSameOrigin(request);
  const user = await getCurrentUser(request);
  if (!user) {
    return data<ActionData>(
      { message: "Utilisateur non authentifié." },
      { status: 401 }
    );
  }

  if (!user.isSuperAdmin) {
    return data<ActionData>(
      { message: "Seul un super-administrateur peut créer un espace." },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const formValues = Object.fromEntries(formData);
  const validatedFields = createSpaceSchema.safeParse(formValues);

  if (!validatedFields.success) {
    return data<ActionData>(
      {
        errors: validatedFields.error.flatten().fieldErrors,
        message: "Validation échouée.",
      },
      { status: 400 }
    );
  }

  try {
    const { name, description } = validatedFields.data;
    const userId = user.id;

    const newSpace = await createSpaceWithAdmin(
      name,
      description || null,
      userId
    );

    const session = await getSession(request);
    session.flash("toast", {
      title: `Création d'espace`,
      message: `L'espace "${newSpace.name}" a été créé avec succès !`,
    });

    // Commit the session
    return redirect("/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    logServerException(error, {
      operation: "space.mutate",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return data<ActionData>(
      {
        message: "Erreur lors de la création de l'espace. Veuillez réessayer.",
      },
      { status: 500 }
    );
  }
}
