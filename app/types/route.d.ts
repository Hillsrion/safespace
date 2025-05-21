import 'react-router';

declare module 'react-router' {
  interface RouteObject {
    handle?: {
      crumb: string;
    };
  }
}
