import { createThemeAction } from "remix-themes";
import { themeSessionResolver } from "~/services/session.server"; // Corrected path

export const action = createThemeAction(themeSessionResolver);
