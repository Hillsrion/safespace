import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from "react-router";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import { Toaster } from "./components/ui/toaster";
import { getSession } from "./services/session.server";

import clsx from "clsx";
import { PreventFlashOnWrongTheme, ThemeProvider, useTheme } from "remix-themes";
import { themeSessionResolver } from "./services/session.server";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "stylesheet", href: stylesheet },
];

export const loader = async ({ request }: { request: Request }) => {
  const { getTheme } = await themeSessionResolver(request);
  const session = await getSession(request);
  const user = session.get("user");
  return {
    theme: getTheme(),
    user,
  };
};

// Component that renders the actual HTML structure
function AppBody() {
  const data = useLoaderData<typeof loader>();
  const [theme] = useTheme();
  return (
    <html lang="en" className={clsx(theme || "null")}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(data.theme)} />
        <Links />
      </head>
      <body>
        <Outlet />
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Default export component that wraps AppBody with ThemeProvider
export default function App() {
  const data = useLoaderData<typeof loader>();
  return (
    <ThemeProvider specifiedTheme={data?.theme} themeAction="/action/set-theme">
      <AppBody />
    </ThemeProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const data = useLoaderData<typeof loader>();

  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
    if (import.meta.env.DEV) {
        stack = error.stack;
    }
  }

  return (
    <html lang="en" className={clsx(data?.theme || "null")}>
      <head>
        <title>{message}</title>
        <Meta />
      <ThemeProvider specifiedTheme={data?.theme} themeAction="/action/set-theme">
        {data?.theme !== undefined && <PreventFlashOnWrongTheme ssrTheme={Boolean(data?.theme)} />}
        <Links />
      </ThemeProvider>
      </head>
      <body>
        <main className="pt-16 p-4 container mx-auto">
          <h1>{message}</h1>
          <p>{details}</p>
          {stack && (
            <pre className="w-full p-4 overflow-x-auto">
              <code>{stack}</code>
            </pre>
          )}
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
