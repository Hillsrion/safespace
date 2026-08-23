const LAST_VISITED_SPACE_COOKIE = "safespace_last_visited_space";
const LAST_VISITED_SPACE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function getLastVisitedSpaceId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== LAST_VISITED_SPACE_COOKIE) continue;
    try {
      const value = decodeURIComponent(rawValue.join("="));
      return isUuid(value) ? value : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function selectAccessibleLastVisitedSpace<T extends { id: string }>(
  lastVisitedSpaceId: string | null,
  spaces: T[]
): T | null {
  if (!lastVisitedSpaceId) return null;
  return spaces.find((space) => space.id === lastVisitedSpaceId) ?? null;
}

export function persistLastVisitedSpace(pathname: string): void {
  if (typeof document === "undefined") return;

  const match = pathname.match(/^\/dashboard\/spaces\/([0-9a-f-]+)$/i);
  const spaceId = match?.[1];
  if (!spaceId || !isUuid(spaceId)) return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = [
    `${LAST_VISITED_SPACE_COOKIE}=${encodeURIComponent(spaceId)}`,
    "Path=/",
    `Max-Age=${LAST_VISITED_SPACE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    secure,
  ].join("; ");
}

export function clearLastVisitedSpaceCookie(): string {
  return `${LAST_VISITED_SPACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
