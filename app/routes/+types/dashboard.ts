import type { MetaFunction, LoaderFunction } from "@remix-run/node";

declare global {
  namespace Route {
    interface MetaArgs {
      data: unknown;
      params: Record<string, string>;
      location: {
        pathname: string;
        search: string;
        hash: string;
      };
    }

    interface MetaFunction {
      (args: MetaArgs): {
        title?: string;
        description?: string;
        [key: string]: unknown;
      }[];
    }
  }
}

export {};
