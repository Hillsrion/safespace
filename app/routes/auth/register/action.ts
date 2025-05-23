import { data, redirect } from "@remix-run/node";
import type { User } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { hashPassword } from "~/lib/password";
import { getSession, commitSession } from "~/services/session.server";
import { registerSchema } from "~/hooks/useRegister";

export async function action({ request }: { request: Request }) {
  try {
    const formData = await request.formData();
    const dataObj = Object.fromEntries(formData);

    const parsedData = registerSchema.safeParse(dataObj);
    if (!parsedData.success) {
      const errors = parsedData.error.flatten();
      return data(
        {
          errors: {
            fieldErrors: errors.fieldErrors,
            formErrors: errors.formErrors,
          },
        },
        { status: 400 }
      );
    }

    const { email, password, firstName, lastName, instagram } = parsedData.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return data(
        {
          errors: {
            fieldErrors: {},
            formErrors: ["Email already in use"],
          },
        },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        instagram,
      },
    });

    const session = await getSession(request);
    const userForSession: Pick<
      User,
      "id" | "email" | "firstName" | "lastName"
    > = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    session.set("user", userForSession);

    return redirect("/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    console.log(error);
    return data(
      {
        errors: {
          fieldErrors: {},
          formErrors: ["An unexpected error occurred"],
        },
      },
      { status: 500 }
    );
  }
}
