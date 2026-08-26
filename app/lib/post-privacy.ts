const ANONYMOUS_AUTHOR = {
  id: "anonymous",
  firstName: "Anonymous",
  lastName: "",
  instagram: null,
  name: "Anonymous",
  role: "user",
} as const;

/** Remove direct and indirect author identifiers before serializing a post. */
export function redactAnonymousPost<T extends { isAnonymous: boolean }>(
  post: T
): T {
  const redacted: Record<string, unknown> = { ...post };

  // Storage locators, uploader identity, and content hashes are internal-only.
  // Every client receives an application URL that re-authorizes the request.
  if (Array.isArray(redacted.media)) {
    redacted.media = redacted.media.map((item: unknown) => {
      if (!item || typeof item !== "object") return item;
      const {
        uploaderId: _uploaderId,
        storageKey: _storageKey,
        sha256: _sha256,
        ...safeItem
      } = item as Record<string, unknown>;
      return {
        ...safeItem,
        ...(typeof safeItem.id === "string"
          ? { url: `/resources/api/media/${safeItem.id}` }
          : {}),
      };
    });
  }

  if (!post.isAnonymous) return redacted as T;

  if ("authorId" in redacted) redacted.authorId = null;
  if ("author" in redacted) redacted.author = ANONYMOUS_AUTHOR;

  return redacted as T;
}
