import { type ActionFunctionArgs, data, redirect } from "react-router";

import { createSpaceSchema } from "~/lib/schemas/spaceSchemas";
import { getCurrentUser } from "~/services/auth.server";
import { getSession, commitSession } from "~/services/session.server";
import {
  createSpace,
  addUserToSpace,
} from "~/db/repositories/spaces/queries.server";

export type ActionData = {
  errors?: {
    name?: string[];
    description?: string[];
  };
  message?: string;
};

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) {
    return data<ActionData>(
      { message: "Utilisateur non authentifié." },
      { status: 401 }
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

    const newSpace = await createSpace(name, description || null, userId);
    await addUserToSpace(userId, newSpace.id, "ADMIN");

    const session = await getSession(request);
    session.flash("toast", {
      title: `Création d'espace`,
      message: `L'espace "${newSpace.name}" a été créé avec succès !`,
    });
    return redirect("/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la création de l’espace:", error);
    return data<ActionData>(
      {
        message: "Erreur lors de la création de l'espace. Veuillez réessayer.",
      },
      { status: 500 }
    );
  }
}
