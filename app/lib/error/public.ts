/**
 * Stable user-facing messages for error boundaries and domain errors whose
 * original text could include names, identifiers or submitted content.
 */
export function publicMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return "The request is invalid.";
    case 401:
      return "Authentication is required.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested resource could not be found.";
    case 409:
      return "The request conflicts with the current state. Refresh and try again.";
    default:
      return "An unexpected error occurred.";
  }
}

const STATIC_DOMAIN_MESSAGES = new Set([
  "A space must retain at least one administrator",
  "Account owns spaces that must be transferred before deletion",
  "Authentication is no longer valid",
  "Member already has this role",
  "Member not found in this space",
  "Member role is invalid",
  "Membership not found in this space",
  "Only a super-administrator may manage administrator roles",
  "Password confirmation is invalid",
  "Space administrator rights are required",
  "Space not found",
  "The platform must retain at least one super-administrator",
]);

/**
 * Domain services may return a small set of reviewed, static recovery hints.
 * Any interpolated, future, or otherwise unknown message falls back to the
 * status-only public message rather than being reflected to the client.
 */
export function publicDomainErrorMessage(status: number, message: string): string {
  return STATIC_DOMAIN_MESSAGES.has(message)
    ? message
    : publicMessageForStatus(status);
}
