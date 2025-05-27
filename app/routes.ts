import {
  type RouteConfig,
  index,
  route,
  layout,
  prefix,
} from "@react-router/dev/routes";

const ROUTES_PREFIX = "routes";
const LAYOUTS_PREFIX = "layouts";

export const DASHBOARD_PATH = "dashboard";
export const LOGIN_PATH = "auth/login";
export const REGISTER_PATH = "auth/register";
export const API_PATH = "api";
export const RESOURCES_API_PREFIX = "resources/api";

export default [
  index(`${ROUTES_PREFIX}/home.tsx`),
  route(REGISTER_PATH, `${ROUTES_PREFIX}/auth/register/index.tsx`),
  route(LOGIN_PATH, `${ROUTES_PREFIX}/auth/login/index.tsx`),
  route("auth/logout", `${ROUTES_PREFIX}/auth/logout.tsx`),
  route(DASHBOARD_PATH, `${LAYOUTS_PREFIX}/dashboard.tsx`, [
    index(`${ROUTES_PREFIX}/dashboard/index.tsx`),
    route("account", `${ROUTES_PREFIX}/dashboard/account/index.tsx`),
    route("superadmin", `${ROUTES_PREFIX}/dashboard/superadmin.tsx`),
    route("spaces/new", `${ROUTES_PREFIX}/dashboard/spaces/new.tsx`),
  ]),
  layout(`${LAYOUTS_PREFIX}/api.tsx`, [
    ...prefix(RESOURCES_API_PREFIX, [
      route(`search`, `${ROUTES_PREFIX}/api/search.ts`),
      route(`spaces`, `${ROUTES_PREFIX}/api/spaces.ts`),
      route(`posts/:id/delete`, `${ROUTES_PREFIX}/api/posts/:id/delete.ts`),
      route(`posts/:id/edit`, `${ROUTES_PREFIX}/api/posts/:id/edit.ts`),
    ]),
  ]),
] satisfies RouteConfig;
