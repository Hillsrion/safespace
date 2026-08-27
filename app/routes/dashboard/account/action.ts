import { data, type ActionFunctionArgs } from "react-router";
import { getCurrentUser } from "~/services/auth.server";
import { accountSchema } from "~/hooks/useAccount";
import { requireSameOrigin } from "~/lib/security.server";
import { logServerException } from "~/lib/error/server-error.server";
import {
  AccountProfileError,
  updateOwnAccount,
} from "~/services/account-profile.server";

export async function action({ request }: ActionFunctionArgs) {
  requireSameOrigin(request);
  const userId = (await getCurrentUser(request))?.id;

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

  const formData = await request.formData();
  const formValues = Object.fromEntries(formData);

  // Process password fields
  const passwordFields = {
    // Password whitespace is significant and must never be normalized.
    currentPassword: formValues.currentPassword?.toString() || '',
    newPassword: formValues.newPassword?.toString() || '',
    confirmPassword: formValues.confirmPassword?.toString() || ''
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

  const { confirmPassword: _confirmPassword, ...accountUpdate } = result.data;

  try {
    await updateOwnAccount(userId, accountUpdate);

    return data({ success: true });
  } catch (error) {
    if (error instanceof AccountProfileError) {
      return data(
        {
          errors: error.field
            ? { fieldErrors: { [error.field]: [error.message] } }
            : { formErrors: [error.message] },
        },
        { status: error.status }
      );
    }
    logServerException(error, {
      operation: "account.update",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
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
