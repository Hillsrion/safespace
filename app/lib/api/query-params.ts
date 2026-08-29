import { errors } from "~/lib/api/http-error";

export function parseUniqueSearchParams(
  request: Request,
  duplicateMessage = "Duplicate query parameter"
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) throw errors.badRequest(duplicateMessage);
    values[key] = value;
  }
  return values;
}
