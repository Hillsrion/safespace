import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("register", "routes/register/index.tsx"),
  route("login", "routes/login/index.tsx"),
] satisfies RouteConfig;
