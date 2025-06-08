// app/routes/api.spaces.$spaceId.leave.ts
import { data, type ActionFunctionArgs } from "@remix-run/node";
import { getCurrentUser } from "~/services/auth.server";
import { removeUserFromSpace } from "~/db/repositories/spaces/queries.server";
import { leaveSpaceSchema } from "~/lib/schemas/spaceSchemas";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getCurrentUser(request);
  if (!user) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const validationResult = leaveSpaceSchema.safeParse(params);

  if (!validationResult.success) {
    return data(
      { error: "Validation failed", issues: validationResult.error.flatten() },
      { status: 400 }
    );
  }

  const { spaceId } = validationResult.data; // Use validated spaceId

  try {
    // Call the actual database function
    const result = await removeUserFromSpace(user.id, spaceId);

    if (result.count === 0) {
      // Optionally, handle the case where the user was not a member
      // For now, we can treat this as a successful outcome (user is not in space)
      console.log(
        `User ${user.id} was not a member of space ${spaceId}, or already left.`
      );
    }

    return data({
      success: true,
      message: `Successfully left space ${spaceId}`,
    });
  } catch (error) {
    console.error(
      `Error processing leave space request for user ${user.id}, space ${spaceId}:`,
      error
    );
    return data({ error: "Failed to leave space" }, { status: 500 });
  }
}
