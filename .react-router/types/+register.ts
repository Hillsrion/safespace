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
  "/api": {};
  "/api/search": {};
};