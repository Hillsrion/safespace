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
- For loaders, return data directly and let Remix handle the response
- For actions, return a simple success/error object

```typescript
// Loader example
import { data } from "@remix-run/node";

export async function loader() {
  const result = await fetchData();
  return data(result);
}

// Action example
export async function action() {
  try {
    await doSomething();
    return { success: true };
  } catch (error) {
    return { success: false, error: "Something went wrong" };
  }
}
```

### 3. Error Handling

#### HTTP Errors

For HTTP errors, use the error helpers from `~/lib/api/http-error`:

```typescript
import { errors } from "~/lib/api/http-error";

// Authentication errors
if (!user) {
  throw errors.unauthorized("You must be logged in to access this resource");
}

// Authorization errors
if (!hasPermission) {
  throw errors.forbidden("Insufficient permissions");
}

// Not found errors
if (!resource) {
  throw errors.notFound("Resource not found");
}

// Server errors
try {
  // ...
} catch (error) {
  console.error(error);
  throw errors.internalServerError("Something went wrong");
}
```

#### Action Errors

For form submissions and actions, return error objects directly:

```typescript
export async function action() {
  if (!isValid) {
    return { success: false, error: "Invalid input" };
  }
  try {
    await doSomething();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: "Failed to process request",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
```

#### Error Response Format

HTTP errors follow this format (handled by Remix's error boundaries):

```typescript
{
  "success": false,
  "error": "Error message",
  "code": "error_code:category",
  "details": { /* optional additional details */ }
}
```

Action errors return the response directly:

```typescript
{
  "success": false,
  "error": "Error message",
  "details?": "Additional error details"
}
```

#### Common Error Codes

- `400 bad_request:*` - Invalid request data or parameters
- `401 unauthorized:auth` - Authentication required
- `403 forbidden:auth` - Insufficient permissions
- `404 not_found:api` - Resource not found
- `409 conflict:api` - Resource state conflict
- `500 server_error:api` - Internal server error

#### Best Practices

- Use HTTP errors for HTTP-level concerns (auth, not found, etc.)
- Use action return values for form validation and business logic errors
- Always include user-friendly error messages
- Log detailed errors server-side
- Use appropriate HTTP status codes
- Let Remix's error boundaries handle HTTP error responses

## Remix Data Loading

### 1. Data Loading Functions

- Use the `data` function from `@remix-run/node` for all loader responses
- The `json` function is deprecated and must never be used
- The `data` function provides better TypeScript support and is the recommended approach in Remix v2+

### 2. Data Fetching Pattern

```typescript
// Loader with data function
import type { LoaderFunctionArgs } from "@remix-run/node";
import { data } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

// Type for the loader data
type LoaderData = {
  items: Item[];
  total: number;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page")) || 1;
<<<<<<< HEAD

  const { items, total } = await fetchPaginatedData({ page });

  return data<LoaderData>({
=======

  const { items, total } = await fetchPaginatedData({ page });

  return data<LoaderData>({
>>>>>>> 0324cf7 (refactor: change response error system for API)
    items,
    total,
    page,
  });
}

export default function RouteComponent() {
  const { items, total, page } = useLoaderData<typeof loader>();
  // ...
}

// Action pattern
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
<<<<<<< HEAD

=======

>>>>>>> 0324cf7 (refactor: change response error system for API)
  try {
    switch (intent) {
      case "create":
        const item = await createItem(formData);
        return { success: true, item };
<<<<<<< HEAD

      case "update":
        const updated = await updateItem(formData);
        return { success: true, item: updated };

      default:
        return {
          success: false,
          error: "Invalid intent"
        };
    }
  } catch (error) {
    return {
      success: false,
=======

      case "update":
        const updated = await updateItem(formData);
        return { success: true, item: updated };

      default:
        return {
          success: false,
          error: "Invalid intent"
        };
    }
  } catch (error) {
    return {
      success: false,
>>>>>>> 0324cf7 (refactor: change response error system for API)
      error: "Failed to process request",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}
```

### 3. Form Handling

```typescript
// Form component
export default function ItemForm() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
<<<<<<< HEAD

=======

>>>>>>> 0324cf7 (refactor: change response error system for API)
  return (
    <Form method="post">
      {actionData?.error && (
        <div className="error">{actionData.error}</div>
      )}
<<<<<<< HEAD

      <input name="name" required />
      <input name="description" />

      <button
        type="submit"
        name="intent"
=======

      <input name="name" required />
      <input name="description" />

      <button
        type="submit"
        name="intent"
>>>>>>> 0324cf7 (refactor: change response error system for API)
        value="create"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating...' : 'Create Item'}
      </button>
    </Form>
  );
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
