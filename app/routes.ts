import {
  type RouteConfig,
  index,
  route,
  layout,
  prefix,
} from "@react-router/dev/routes";
import { DASHBOARD_PATH, LOGIN_PATH, REGISTER_PATH, RESOURCES_API_PREFIX } from "./lib/route-paths";
export { DASHBOARD_PATH, LOGIN_PATH, REGISTER_PATH, API_PATH, RESOURCES_API_PREFIX } from "./lib/route-paths";

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

export default [
  index(routePath("home.tsx")),
  route("community-policy", routePath("community-policy.tsx")),
  route(REGISTER_PATH, routePath("auth/register/index.tsx")),
  route(LOGIN_PATH, routePath("auth/login/index.tsx")),
  route(":spaceId/login", routePath("space-login.tsx")),
  route("auth/superadmin/login", routePath("auth/superadmin/login.tsx")),
  route("auth/logout", routePath("auth/logout.tsx")),
  route("auth/me", routePath("api/auth/me.ts")),
  route(DASHBOARD_PATH, layoutPath("dashboard.tsx"), [
    index(routePath("dashboard/index.tsx")),
    route("welcome", routePath("dashboard/welcome.tsx")),
    route("account", routePath("dashboard/account/index.tsx")),
    route("moderation", routePath("dashboard/moderation.tsx")),
    route("sensitive-reviews", routePath("dashboard/sensitive-reviews.tsx")),
    route("superadmin", routePath("dashboard/superadmin.tsx")),
    route("superadmin/announcements", routePath("dashboard/superadmin-announcements.tsx")),
    route("spaces/new", routePath("dashboard/spaces/new.tsx")),
    route("spaces/:spaceId", routePath("dashboard/spaces/:spaceId.tsx")),
    route("posts/new", routePath("dashboard/posts/new.tsx")),
    route("posts/:id/edit", routePath("dashboard/posts/:id/edit.tsx")),
    route("entities/:id", routePath("dashboard/entities/detail.tsx")),
    route("entities", routePath("dashboard/entities/index.tsx")),
  ]),
  layout(layoutPath("api.tsx"), [
    ...prefix(RESOURCES_API_PREFIX, [
      route(`search`, routePath("api/search.ts")),
      route(`saved-searches`, routePath("api/saved-searches.ts")),
      route(`saved-searches/:savedSearchId`, routePath("api/saved-searches/:savedSearchId.ts")),
      route(`media/upload`, routePath("api/media/upload.ts")),
      route(`media/:mediaId`, routePath("api/media/:mediaId.ts")),
      route(`superadmin/spaces`, routePath("api/superadmin/spaces.ts")),
      route(`superadmin/spaces/:spaceId`, routePath("api/superadmin/spaces/:spaceId.ts")),
      route(`superadmin/audit-logs`, routePath("api/superadmin/audit-logs.ts")),
      route(`superadmin/users`, routePath("api/superadmin/users.ts")),
      route(`superadmin/users/:userId`, routePath("api/superadmin/users/:userId.ts")),
      route(`superadmin/announcements`, routePath("api/superadmin/announcements.ts")),
      route(`superadmin/announcements/:announcementId`, routePath("api/superadmin/announcements/:announcementId.ts")),
      route(`announcements`, routePath("api/announcements.ts")),
      route(`spaces`, routePath("api/spaces.ts")),
      route(`spaces/:spaceId/sensitive-reviews`, routePath("api/spaces/:spaceId/sensitive-reviews.ts")),
      route(`spaces/:spaceId/sensitive-reviews/:postId`, routePath("api/spaces/:spaceId/sensitive-reviews/:postId.ts")),
      route(`spaces/:spaceId/members/:userId/role`, routePath("api/spaces/:spaceId/members/:userId/role.ts")),
      route(`spaces/:spaceId/members/:userId/kick`, routePath("api/spaces/:spaceId/members/:userId/kick.ts")),
      route(`spaces/:spaceId/leave`, routePath("api/spaces/:spaceId/leave.ts")),
      route(`spaces/:spaceId/entities`, routePath("api/spaces/:spaceId/entities.ts")),
      route(`spaces/:spaceId/entities/:entityId`, routePath("api/spaces/:spaceId/entities/:entityId.ts")),
      route(`spaces/:spaceId/entities/:entityId/handles/:handleId/review`, routePath("api/spaces/:spaceId/entities/:entityId/handles/:handleId/review.ts")),
      route(`spaces/:spaceId/reported-entities`, routePath("api/spaces/:spaceId/reported-entities.ts")),
      route(`spaces/:spaceId/reported-entities/:entityId`, routePath("api/spaces/:spaceId/reported-entities/:entityId.ts")),
      route(`account/delete`, routePath("api/account/delete.ts")),
      route(`account/export`, routePath("api/account/export.ts")),
      route(`users/current`, routePath("api/users/current.ts")),
      route(`spaces/:spaceId/posts/:postId/flag`, routePath("api/spaces/:spaceId/posts/:postId/flag.ts")),
      route(`spaces/:spaceId/posts`, routePath("api/spaces/:spaceId/posts.ts")),
      route(`spaces/:spaceId/posts/:postId`, routePath("api/spaces/:spaceId/posts/:postId.ts")),
      route(`spaces/:spaceId/moderation/flags`, routePath("api/spaces/:spaceId/moderation/flags.ts")),
      route(`spaces/:spaceId/moderation/flags/:flagId`, routePath("api/spaces/:spaceId/moderation/flags/:flagId.ts")),
      route(`spaces/:spaceId/moderation/appeals`, routePath("api/spaces/:spaceId/moderation/appeals.ts")),
      route(`spaces/:spaceId/moderation/appeals/:appealId`, routePath("api/spaces/:spaceId/moderation/appeals/:appealId.ts")),
      route(`spaces/:spaceId/moderation/discipline`, routePath("api/spaces/:spaceId/moderation/discipline.ts")),
      route(`spaces/:spaceId/moderation/discipline/:disciplineId`, routePath("api/spaces/:spaceId/moderation/discipline/:disciplineId.ts")),
      route(`spaces/:spaceId/members/:userId/moderation-history`, routePath("api/spaces/:spaceId/members/:userId/moderation-history.ts")),
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
