import { type RouteConfig, index, route } from "@react-router/dev/routes";

export const DASHBOARD_PATH = "dashboard";
export const LOGIN_PATH = "auth/login";
export const REGISTER_PATH = "auth/register";
export const API_PATH = "api";

export default [
  index("routes/home.tsx"),
  route(REGISTER_PATH, "routes/auth/register/index.tsx"),
  route(LOGIN_PATH, "routes/auth/login/index.tsx"),
  route("auth/logout", "routes/auth/logout.tsx"),
  route(DASHBOARD_PATH, "layouts/dashboard.tsx", [
    index("routes/dashboard/index.tsx"),
    route("account", "routes/dashboard/account/index.tsx"),
    route("superadmin", "routes/dashboard/superadmin.tsx"),
    route("spaces/new", "routes/dashboard/spaces/new.tsx"),
  ]),
  route("resources/api/spaces", "routes/api.spaces.ts"),
  route(API_PATH, "layouts/api.tsx", [route("search", "routes/api/search.ts")]),
] satisfies RouteConfig;
