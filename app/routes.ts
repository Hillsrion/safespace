import { type RouteConfig, index, route } from "@react-router/dev/routes";

export const DASHBOARD_PATH = "dashboard";
export const LOGIN_PATH = "auth/login";
export const REGISTER_PATH = "auth/register";

export default [
  index("routes/home.tsx"),
  route(REGISTER_PATH, "routes/auth/register/index.tsx"),
  route(LOGIN_PATH, "routes/auth/login/index.tsx"),
  route(DASHBOARD_PATH, "layouts/dashboard.tsx", [
    index("routes/dashboard.tsx"),
  ]),
] satisfies RouteConfig;
