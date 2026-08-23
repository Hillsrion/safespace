import { describe, expect, it } from "vitest";
import { toCursorPage } from "./queries.server";

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
