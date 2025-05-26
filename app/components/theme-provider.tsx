import { ThemeProvider as RemixThemeProvider, Theme } from "remix-themes";
import { useTheme } from "remix-themes";
import { useEffect, useState } from "react";

export function ThemeProvider({
  children,
  specifiedTheme,
}: {
  children: React.ReactNode;
  specifiedTheme: Theme | null;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <RemixThemeProvider specifiedTheme={specifiedTheme} themeAction="/action/set-theme">
      {children}
    </RemixThemeProvider>
  );
}
