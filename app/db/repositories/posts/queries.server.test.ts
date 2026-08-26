import { describe, expect, it } from "vitest";
import {
  redactAnonymousPost,
  toCursorPage,
  withViewerPermissions,
} from "./queries.server";

describe("post cursor pagination", () => {
  it("uses the last returned item as the next cursor", () => {
    const page = toCursorPage(
      [{ id: "post-3" }, { id: "post-2" }, { id: "post-1" }],
      2
    );

    expect(page.posts).toEqual([{ id: "post-3" }, { id: "post-2" }]);
    expect(page.nextCursor).toBe("post-2");
    expect(page.hasNextPage).toBe(true);
  });

  it("does not emit a cursor when the page is complete", () => {
    expect(toCursorPage([{ id: "post-1" }], 2)).toEqual({
      posts: [{ id: "post-1" }],
      nextCursor: undefined,
      hasNextPage: false,
    });
  });
});

describe("post read security", () => {
  it("never serializes private object-storage locators", () => {
    const safe = redactAnonymousPost({
      id: "post-1",
      isAnonymous: false,
      media: [
        {
          id: "media-1",
          uploaderId: "uploader-1",
          storageKey: "evidence/v1/private.jpg",
          sha256: "private-hash",
          fileName: "proof.jpg",
        },
      ],
    });

    expect(safe.media[0]).toEqual({
      id: "media-1",
      fileName: "proof.jpg",
      url: "/resources/api/media/media-1",
    });
  });

  it("removes direct and indirect author identity from anonymous posts", () => {
    const safe = redactAnonymousPost({
      id: "post-1",
      isAnonymous: true,
      authorId: "secret-author",
      author: { id: "secret-author", firstName: "Secret" },
      media: [
        {
          id: "media-1",
          uploaderId: "secret-author",
          storageKey: "evidence/private.jpg",
          sha256: "private-hash",
          fileName: "proof.jpg",
        },
      ],
    });

    expect(safe.authorId).toBeNull();
    expect(safe.author).toEqual(expect.objectContaining({ id: "anonymous" }));
    expect(safe.author).not.toEqual(
      expect.objectContaining({ firstName: "Secret" })
    );
    expect(safe.media[0]).not.toHaveProperty("uploaderId");
    expect(safe.media[0]).not.toHaveProperty("storageKey");
    expect(safe.media[0]).not.toHaveProperty("sha256");
    expect(safe.media[0]).toHaveProperty("url", "/resources/api/media/media-1");
  });

  it("lets an anonymous Editor see edit capability without exposing ownership", () => {
    const decorated = withViewerPermissions(
      {
        id: "post-1",
        authorId: "editor-1",
        spaceId: "space-1",
        isAnonymous: true,
      },
      "editor-1",
      "EDITOR"
    );
    const safe = redactAnonymousPost(decorated);

    expect(safe).toMatchObject({
      authorId: null,
      viewerRole: "EDITOR",
      viewerCanEdit: true,
      viewerCanDelete: false,
      viewerCanModerate: false,
    });
  });

  it("derives moderator and super-admin capabilities without author identity", () => {
    const basePost = {
      id: "post-1",
      authorId: "someone-else",
      spaceId: "space-1",
    };

    expect(
      withViewerPermissions(basePost, "moderator-1", "MODERATOR")
    ).toMatchObject({
      viewerCanEdit: true,
      viewerCanDelete: true,
      viewerCanModerate: true,
    });
    expect(
      withViewerPermissions(basePost, "root-1", "SUPERADMIN")
    ).toMatchObject({
      viewerRole: "SUPERADMIN",
      viewerCanDelete: true,
    });
  });
});
