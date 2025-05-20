import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"), // maps to "/"
  route("register", "routes/register/index.tsx"), // maps to "/register"
] satisfies RouteConfig;
