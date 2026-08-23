import { describe, expect, it } from "vitest";

import { isSearchShortcut } from "./search-shortcut";

describe("isSearchShortcut", () => {
  it("supports both macOS and non-macOS shortcuts", () => {
    expect(isSearchShortcut({ key: "k", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSearchShortcut({ key: "K", metaKey: false, ctrlKey: true })).toBe(true);
  });

  it("does not hijack unmodified typing", () => {
    expect(isSearchShortcut({ key: "k", metaKey: false, ctrlKey: false })).toBe(false);
    expect(isSearchShortcut({ key: "p", metaKey: true, ctrlKey: false })).toBe(false);
  });
});
