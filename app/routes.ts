import {
  type RouteConfig,
  index,
  route,
  layout,
  prefix,
} from "@react-router/dev/routes";

const ROUTES_PREFIX = "routes";
const LAYOUTS_PREFIX = "layouts";

// Helper function to create route paths with prefix
function routePrefix(prefix: string, path: string): string {
  return `${prefix}/${path}`;
}

// Helper function to create route paths with routes prefix
function routePath(path: string): string {
  return routePrefix(ROUTES_PREFIX, path);
}

// Helper function to create route paths with layouts prefix
function layoutPath(path: string): string {
  return routePrefix(LAYOUTS_PREFIX, path);
}

export const DASHBOARD_PATH = "dashboard";
export const LOGIN_PATH = "auth/login";
export const REGISTER_PATH = "auth/register";
export const API_PATH = "api";
export const RESOURCES_API_PREFIX = "resources/api";

export default [
  index(routePath("home.tsx")),
  route(REGISTER_PATH, routePath("auth/register/index.tsx")),
  route(LOGIN_PATH, routePath("auth/login/index.tsx")),
  route("auth/logout", routePath("auth/logout.tsx")),
  route(DASHBOARD_PATH, layoutPath("dashboard.tsx"), [
    index(routePath("dashboard/index.tsx")),
    route("account", routePath("dashboard/account/index.tsx")),
    route("superadmin", routePath("dashboard/superadmin.tsx")),
    route("spaces/new", routePath("dashboard/spaces/new.tsx")),
    route("spaces/:spaceId", routePath("dashboard/spaces/:spaceId.tsx")),
    route("posts/new", routePath("dashboard/posts/new.tsx")),
    route("posts/:id/edit", routePath("dashboard/posts/:id/edit.tsx")),
    route("entities/:id", routePath("dashboard/entities/:id.tsx")),
    route("entities", routePath("dashboard/entities/index.tsx")),
  ]),
  layout(layoutPath("api.tsx"), [
    ...prefix(RESOURCES_API_PREFIX, [
      route(`search`, routePath("api/search.ts")),
      route(`spaces`, routePath("api/spaces.ts")),
      route(`spaces/:spaceId/members/:userId/role`, routePath("api/spaces/:spaceId/members/:userId/role.ts")),
      route(`spaces/:spaceId/members/:userId/kick`, routePath("api/spaces/:spaceId/members/:userId/kick.ts")),
      route(`posts/feed`, routePath("api/posts/feed.ts")),
      route(`posts/create`, routePath("api/posts/create.ts")),
      route(`posts/:id/update`, routePath("api/posts/:id/update.ts")),
      route(`posts/:id/delete`, routePath("api/posts/:id/delete.ts")),
      route(`posts/:id/edit`, routePath("api/posts/:id/edit.ts")),
      route(`entities/:id`, routePath("api/entities/:id.ts")),
      route(`entities/:id/posts`, routePath("api/entities/:id/posts.ts")),
    ]),
  ]),
] satisfies RouteConfig;
