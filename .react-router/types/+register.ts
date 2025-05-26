import "react-router";

declare module "react-router" {
  interface Register {
    params: Params;
  }

  interface Future {
    unstable_middleware: false
  }
}

type Params = {
  "/": {};
  "/auth/register": {};
  "/auth/login": {};
  "/auth/logout": {};
  "/dashboard": {};
  "/dashboard/account": {};
  "/dashboard/superadmin": {};
  "/dashboard/spaces/new": {};
  "/dashboard/posts-example": {};
  "/resources/api/spaces": {};
  "/api": {};
  "/api/search": {};
};