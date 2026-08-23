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
  if (!post.isAnonymous) return post;

  const redacted: Record<string, unknown> = { ...post };
  if ("authorId" in redacted) redacted.authorId = null;
  if ("author" in redacted) redacted.author = ANONYMOUS_AUTHOR;

  if (Array.isArray(redacted.media)) {
    redacted.media = redacted.media.map((item: unknown) => {
      if (!item || typeof item !== "object") return item;
      const { uploaderId: _uploaderId, ...safeItem } = item as Record<
        string,
        unknown
      >;
      return safeItem;
    });
  }

  return redacted as T;
}
