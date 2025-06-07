# Error Handling System

This directory contains the error handling utilities for the application. The system is designed to provide consistent error handling across the entire application, with support for different error types, surfaces, and user-friendly error messages.

## Core Concepts

### Error Types
- **bad_request**: Invalid request data or parameters
- **unauthorized**: Authentication required or invalid credentials
- **forbidden**: Insufficient permissions
- **not_found**: Requested resource not found
- **conflict**: Resource state conflict
- **rate_limit**: Rate limit exceeded
- **server_error**: Internal server error
- **validation_error**: Data validation failed
- **network_error**: Network-related errors

### Surfaces
- **api**: API-related errors
- **chat**: Chat-related errors
- **posts**: Post-related errors
- **auth**: Authentication/authorization errors
- **spaces**: Space-related errors
- **users**: User-related errors
- **form**: Form validation errors

## Usage

### Creating Errors

```typescript
import { createError } from '~/lib/error/parse';

// Basic error
throw createError('User not found', 'not_found:users', 404);

// With additional details
throw createError(
  'Invalid input', 
  'validation_error:form', 
  400,
  { fields: ['email', 'password'] }
);
```

### Handling Errors

```typescript
import { handleError } from '~/lib/error/handle';

try {
  // Your code here
} catch (error) {
  const userMessage = handleError(error);
  // userMessage contains a user-friendly error message
}
```

### API Error Responses

Use the API response utilities to create consistent API responses:

```typescript
import { errorResponse, successResponse } from '~/lib/api/response';

// Success response
return successResponse({ id: 123, name: 'Test' });

// Error response
return errorResponse('Invalid input', 'validation_error:form', 400);
```

## API Client Usage

Use the `useApi` hook in your components for API calls with built-in error handling:

```typescript
import { usePostApi } from '~/services/api.client/posts';

function MyComponent() {
  const { deletePost, isLoading, error } = usePostApi();

  const handleDelete = async (postId: string) => {
    const { data, error } = await deletePost(postId);
    if (data) {
      // Handle success
    }
    // Error is automatically shown to the user via toast
  };

  return (
    // Your component JSX
  );
}
```

## Best Practices

1. **Always use specific error types** that accurately describe what went wrong
2. **Include helpful error messages** that can be shown to users
3. **Add additional details** to errors when they might help with debugging
4. **Handle errors at the appropriate level** - don't swallow errors that should be handled by the caller
5. **Log unexpected errors** to your error tracking service

## Testing

When testing components that use the error handling system, you can mock the error utilities:

```typescript
import * as errorUtils from '~/lib/error/handle';

jest.spyOn(errorUtils, 'handleError').mockImplementation(() => 'Test error message');
```
