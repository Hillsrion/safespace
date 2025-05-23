import { createCookieSessionStorage } from "@remix-run/node";
import { createThemeSessionResolver } from "remix-themes"; // Added

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET!], 
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
  // Consider committing session here if unset should persist immediately:
  // await commitSession(session); 
  return error;
}

// This is the crucial part for remix-themes:
// It uses the `sessionStorage` defined above.
export const themeSessionResolver = createThemeSessionResolver(sessionStorage);