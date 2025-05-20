import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("auth/register", "routes/auth/register/index.tsx"),
  route("auth/login", "routes/auth/login/index.tsx"),
] satisfies RouteConfig;
