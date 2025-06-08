---
trigger: always_on
---

# Error Handling Standards

## Error Types

Use these standard error types consistently throughout the application:

| Type               | Description                                    | HTTP Status |
| ------------------ | ---------------------------------------------- | ----------- |
| `bad_request`      | Invalid request data or parameters             | 400         |
| `unauthorized`     | Authentication required or invalid credentials | 401         |
| `forbidden`        | Insufficient permissions                       | 403         |
| `not_found`        | Requested resource not found                   | 404         |
| `conflict`         | Resource state conflict                        | 409         |
| `rate_limit`       | Rate limit exceeded                            | 429         |
| `server_error`     | Internal server error                          | 500         |
| `validation_error` | Data validation failed                         | 400         |
| `network_error`    | Network-related errors                         | 502         |

## Error Structure

### Server-Side Errors

```typescript
{
  "success": false,
  "error": {
    "code": "not_found:users",
    "message": "User not found",
    "status": 404,
    "details": {
      // Optional additional details
      "userId": "123"
    },
    "timestamp": "2025-06-08T17:45:35.000Z"
  }
}
```

### Client-Side Error Handling

```typescript
// Handling API errors
const handleApiError = (error: unknown) => {
  if (isApiError(error)) {
    switch (error.type) {
      case "unauthorized":
        // Handle unauthorized
        break;
      case "validation_error":
        // Handle validation errors
        break;
      default:
      // Handle other errors
    }
  }
  // Show user-friendly message
  showToast(error.userMessage || "An unexpected error occurred");
};
```

## Best Practices

### 1. Error Creation

```typescript
// Good - Using createError utility
throw createError(
  "User not found",
  "not_found:users",
  404,
  { userId: "123" } // Additional context
);

// Bad - Using native Error
throw new Error("User not found"); // ❌ Lacks type and context
```

### 2. Error Boundaries

Create error boundaries for React components:

```typescript
function ErrorBoundary({ error }: { error: Error }) {
  const { status, message } = parseError(error);

  if (status === 404) {
    return <NotFoundError />;
  }

  if (status >= 500) {
    return <ServerError error={error} />;
  }

  return <GenericError error={error} />;
}
```

### 3. Form Validation

For form validation errors, include field-level details:

```typescript
throw createError("Validation failed", "validation_error:form", 400, {
  fields: {
    email: "Invalid email format",
    password: "Must be at least 8 characters",
  },
});
```

### 4. Logging

- Log all unexpected errors to your error tracking service
- Include relevant context (user ID, request data, etc.)
- Redact sensitive information before logging

```typescript
// In your error handling middleware
if (isUnexpectedError(error)) {
  logError({
    error,
    context: {
      userId: user?.id,
      path: request.path,
      method: request.method,
    },
  });
}
```

### 5. User-Facing Messages

- Never expose internal error details to users
- Provide helpful, actionable messages
- Include a reference ID for support queries

```typescript
// In your error handling
const userMessage = isProduction
  ? `Something went wrong. Reference: ${errorId}`
  : error.message;

// Show to user
showToast(userMessage);
```

## Testing

### Unit Tests

```typescript
describe("Error Handling", () => {
  it("should handle not found errors", () => {
    const error = createError("Not found", "not_found:users", 404);
    const result = handleError(error);
    expect(result).toMatchObject({
      status: 404,
      code: "not_found:users",
    });
  });
});
```

### Integration Tests

```typescript
describe("API Error Handling", () => {
  it("should return 404 for non-existent resources", async () => {
    const response = await request(app)
      .get("/api/users/invalid-id")
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "not_found:users",
        status: 404,
      },
    });
  });
});
```

## Monitoring and Alerting

- Set up monitoring for error rates by type and endpoint
- Create alerts for critical errors (5xx, authentication failures, etc.)
- Track error trends over time to identify systemic issues

## Security Considerations

- Never expose stack traces in production
- Sanitize error messages to prevent XSS attacks
- Rate limit error reporting to prevent abuse
- Ensure sensitive data is not leaked in error responses
