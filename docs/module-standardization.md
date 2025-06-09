# Module Standardization

## Core Principles

1. **Separation of Concerns**: UI components should focus on rendering, with business logic extracted to hooks.
2. **Reusability**: Share logic through custom hooks.
3. **Maintainability**: Clear structure and consistent patterns.
4. **Testability**: Isolate logic for easier testing.

## Hook Structure

### 1. Local Hooks

For component/route-specific logic.

**Location**: `app/components/[component-name]/hooks/use-[feature].ts`

```typescript
// app/components/post/hooks/use-post-actions.ts
export function usePostActions({ postId }: UsePostActionsProps) {
  // Component-specific logic
}
```

### 2. Global Hooks

For cross-component logic.

**Location**: `app/hooks/use-[feature].ts`

```typescript
// app/hooks/use-search.ts
export function useSearch() {
  // Shared search logic
}
```

## Component Structure

### 1. Container Components

- Handle data and state
- Use hooks for business logic
- Pass only needed props

```tsx
// dashboard.tsx
export default function Dashboard() {
  const { posts, loading, error } = usePosts();
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error} />;
  return <post-list posts={posts} />;
}
```

### 2. Presentational Components

- Focus on UI
- Props for data/callbacks
- Minimal state

```tsx
// post-list.tsx
type PostListProps = {
  posts: Post[];
  onPostClick?: (id: string) => void;
};

export function PostList({ posts, onPostClick }: PostListProps) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <post-card key={post.id} post={post} onClick={onPostClick} />
      ))}
    </div>
  );
}
```

## State Management

### 1. Local State
- `useState` for simple state
- `useReducer` for complex logic

### 2. Global State (Zustand)
- Store per domain in `app/stores`
- Single responsibility
- Immutable updates

```typescript
// app/stores/postStore.ts
interface PostState {
  posts: Post[];
  addPost: (post: Post) => void;
  updatePost: (id: string, updates: Partial<Post>) => void;
  removePost: (id: string) => void;
}

export const usePostStore = create<PostState>((set) => ({
  posts: [],
  addPost: (post) => set((state) => ({ posts: [...state.posts, post] })),
  updatePost: (id, updates) => set((state) => ({
    posts: state.posts.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  removePost: (id) => set((state) => ({
    posts: state.posts.filter(p => p.id !== id)
  }))
}));
```

## API Integration

### API Client Pattern
- Use `useApi` hook
- Group by domain in `app/services/api.client`
- Consistent error handling

```typescript
// app/services/api.client/posts.ts
export function usePostActionsApi() {
  const { callApi } = useApi<PostActionResponse>();

  const deletePost = (postId: string) =>
    callApi(`/api/posts/${postId}`, { method: 'DELETE' });

  return { deletePost };
}
```

## Forms

- `react-hook-form` + `zod` for validation
- Extract form logic to hooks
- Keep components clean

```typescript
// app/hooks/useLoginForm.ts
export function useLoginForm() {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  const handleSubmit = form.handleSubmit((data) => {
    // Submit logic
  });

  return { form, handleSubmit, isSubmitting: form.formState.isSubmitting };
}
```

## Best Practices

1. **Focused Hooks**: One responsibility per hook
2. **Composition**: Build complex logic from simple hooks
3. **Naming**: Always prefix with `use`
4. **Documentation**: JSDoc for public hooks
5. **Testing**: Test hooks in isolation

## Example: Post Feature

### File Structure
```
app/
  components/
    post/
      hooks/
        use-post-actions.ts
        use-post-form.ts
      post.tsx
      post-list.tsx
  hooks/
    use-posts.ts
  stores/
    post-store.ts
  services/
    api.client/
      posts.ts
```

### Component Usage
```tsx
// post-list.tsx
export function PostList() {
  const { posts, loading, error } = usePosts();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {posts.map(post => (
        <post key={post.id} post={post} />
      ))}
    </div>
  );
}
```

## Key Takeaways

1. **Separation**: UI vs. Logic
2. **Reusability**: Custom hooks for shared logic
3. **Consistency**: Follow established patterns
4. **Documentation**: Clear and concise
5. **Testing**: Isolate and test logic
