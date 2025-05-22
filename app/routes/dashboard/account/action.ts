import { data, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { getSession } from "~/services/session.server";
import { verifyPassword, hashPassword } from "~/lib/password";
import { prisma } from "~/db/client.server";
import { accountSchema } from "~/hooks/useAccount";

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request);
  const userId = session.get("user")?.id;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "deleteAccount") {
    if (!userId) {
      return data(
        {
          errors: {
            formErrors: ["Vous devez être connecté pour supprimer votre compte"],
          },
        },
        { status: 401 }
      );
    }
    // In a real application, you would add logic here to delete the user's data
    // from your database. For this example, we'll just log and redirect.
    console.log(`Account deletion requested for user: ${userId}`);
    // This should also handle logging the user out from the session
    // For now, we'll assume a redirect to logout handles session clearance
    return redirect("/auth/logout"); 
  }

  if (!userId) {
    return data(
      {
        errors: {
          formErrors: ["Vous devez être connecté pour mettre à jour votre compte"],
        },
      },
      { status: 401 }
    );
  }

  // const formData = await request.formData(); // Already processed above if intent is not deleteAccount
  const formValues = Object.fromEntries(formData);

  // Process password fields
  const passwordFields = {
    currentPassword: formValues.currentPassword?.toString().trim() || '',
    newPassword: formValues.newPassword?.toString().trim() || '',
    confirmPassword: formValues.confirmPassword?.toString().trim() || ''
  };
  
  const hasPasswordFields = 
    passwordFields.currentPassword || 
    passwordFields.newPassword || 
    passwordFields.confirmPassword;

  // If no password fields are provided, remove them from validation
  if (!hasPasswordFields) {
    delete formValues.currentPassword;
    delete formValues.newPassword;
    delete formValues.confirmPassword;
  } else {
    // If any password field is provided, ensure all are included in the form values
    Object.assign(formValues, passwordFields);
  }

  // Validate form data
  const result = accountSchema.safeParse(formValues);

  if (!result.success) {
    return data(
      {
        errors: {
          fieldErrors: result.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const { currentPassword, newPassword, confirmPassword, ...updateData } = result.data;
  const updatePayload: any = { ...updateData };

  try {
    // If user is updating password
    if (newPassword) {
      // Verify current password
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      if (!user) {
        return data(
          {
            errors: {
              formErrors: ["Utilisateur non trouvé"],
            },
          },
          { status: 404 }
        );
      }

      const isPasswordValid = await verifyPassword(
        currentPassword || "",
        user.password
      );

      if (!isPasswordValid) {
        return data(
          {
            errors: {
              fieldErrors: {
                currentPassword: ["Le mot de passe actuel est incorrect"],
              },
            },
          },
          { status: 400 }
        );
      }

      // Hash new password
      updatePayload.password = await hashPassword(newPassword);
    }

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: updatePayload,
    });

    return data({ success: true });
  } catch (error) {
    console.error("Error updating account:", error);
    return data(
      {
        errors: {
          formErrors: ["Une erreur est survenue lors de la mise à jour de votre compte"],
        },
      },
      { status: 500 }
    );
  }
}
