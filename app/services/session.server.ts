import { createCookieSessionStorage } from "react-router";
import { createThemeSessionResolver } from "remix-themes";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const sessionSecret = process.env.SESSION_SECRET;

if (
  !sessionSecret ||
  sessionSecret.length < 24 ||
  sessionSecret === "your_session_secret_here"
) {
  throw new Error(
    "SESSION_SECRET must be configured with a strong, private value"
  );
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    // Versioning the name invalidates legacy cookies that contained the complete
    // User record (including the password hash).
    name: "safespace_session_v2",
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function commitSession(session: any) {
  return sessionStorage.commitSession(session);
}

export async function destroySession(session: any) {
  return sessionStorage.destroySession(session);
}

export async function getError(request: Request) {
  const session = await getSession(request);
  const error = session.get("error") as string | null;
  session.unset("error");
  return {
    error,
    setCookie: await commitSession(session),
  };
}

// This is the crucial part for remix-themes:
// It uses the `sessionStorage` defined above.
export const themeSessionResolver = createThemeSessionResolver(sessionStorage);
