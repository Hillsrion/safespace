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
  "/dashboard/entities/:id": {
    "id": string;
  };
  "/resources/api/search": {};
  "/resources/api/spaces": {};
  "/resources/api/posts/feed": {};
  "/resources/api/posts/:id/delete": {
    "id": string;
  };
  "/resources/api/posts/:id/edit": {
    "id": string;
  };
};