import type { LoaderFunctionArgs } from "react-router";

import { HttpError } from "~/lib/api/http-error";
import { getCurrentUser } from "~/services/auth.server";
import { exportAccountData } from "~/services/account-export.server";

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  if (request.method.toUpperCase() !== "GET") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET" } }
    );
  }

  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return Response.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    const accountExport = await exportAccountData({ id: user.id });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(accountExport, null, 2), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="safespace-export-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    console.error("Failed to export account data", error);
    return Response.json(
      { success: false, error: "Failed to export account data" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
