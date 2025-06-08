---
trigger: glob
globs: app/routes
---

# API and Routing Standards

## API Structure

### 1. Route Organization

- All API routes should be placed under the `app/routes/api` directory
- Group related routes in subdirectories (e.g., `api/v1/users`, `api/v1/posts`)
- Use kebab-case for route file names (e.g., `get-users.ts`, `update-profile.ts`)
- Version your API (e.g., `v1`, `v2`) in the URL path

### 2. Request/Response Handling

- Always use TypeScript types/interfaces for request and response payloads
- Use `zod` for runtime validation of all incoming requests
- Return consistent response structures:
  ```typescript
  interface ApiResponse<T> {
    data?: T;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
    meta?: {
      page?: number;
      pageSize?: number;
      total?: number;
    };
  }
  ```

### 3. Error Handling

- Use HTTP status codes appropriately
- Implement custom error classes for different error types
- Always return meaningful error messages and codes
- Log errors appropriately on the server

## Remix Data Loading

### 1. Data Loading Functions

- Always use the `data` function from `@remix-run/node` for returning responses
- The `json` function from `@remix-run/node` is deprecated and must never be used
- The `data` function provides better TypeScript support and is the recommended approach in Remix v2+

### 2. Data Fetching Pattern

```typescript
// Good - Using data function
import type { LoaderFunctionArgs } from "@remix-run/node";
import { data } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await fetchData();
  return data({ result });
}

export default function RouteComponent() {
  const { result } = useLoaderData<typeof loader>();
  // ...
}

// Bad - Using json function (deprecated)
import { json } from "@remix-run/node"; // ❌ Do not import json

export async function loader() {
  const result = await fetchData();
  return json({ result }); // ❌ Never use json()
}

// Also Bad - Direct object return (loses type safety)
export async function loader() {
  const result = await fetchData();
  return { result }; // ❌ Avoid direct object returns
}
```

### 3. Route Module Exports

- Always explicitly type your loader/action return types
- Use `MetaFunction` for route metadata
- Implement `ErrorBoundary` and `CatchBoundary` for error handling

## Authentication & Authorization

### 1. Middleware

- Use Remix's `loader`/`action` context for auth checks
- Implement a `requireUser` utility for protected routes
- Validate user permissions in loaders/actions

### 2. Protected Routes

```typescript
// utils/auth.server.ts
export async function requireUser(request: Request) {
  const userId = await getUserId(request);
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return userId;
}

// routes/protected-route.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUser(request);
  // Proceed with authenticated user
}
```

## Best Practices

1. **Type Safety**

   - Use TypeScript for all API routes and utilities
   - Share types between frontend and backend when possible

2. **Validation**

   - Validate all inputs with zod schemas
   - Sanitize all outputs

3. **Documentation**

   - Document API endpoints with OpenAPI/Swagger
   - Include examples for request/response payloads

4. **Performance**
   - Implement proper caching headers
   - Use `stale-while-revalidate` where appropriate
   - Consider implementing GraphQL or tRPC for complex data requirements
