import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemAnnouncementBanner } from "./system-announcement-banner";

const base = { id: "notice", content: "A discreet notice", publishedAt: "2026-08-28T10:00:00.000Z", expiresAt: null, updatedAt: "2026-08-28T10:00:00.000Z" };
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe("system announcement banner", () => {
  it("dismisses locally and shows an updated announcement again", async () => {
    const view = render(<SystemAnnouncementBanner announcements={[base]} />);
    fireEvent.click(screen.getByRole("button", { name: /masquer cette annonce/i }));
    expect(screen.queryByText(base.content)).toBeNull();
    view.rerender(<SystemAnnouncementBanner announcements={[{ ...base, content: "Updated notice", updatedAt: "2026-08-29T10:00:00.000Z" }]} />);
    await waitFor(() => expect(screen.getByText("Updated notice")).toBeTruthy());
  });
  it("remains usable when the browser refuses local storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    render(<SystemAnnouncementBanner announcements={[base]} />);
    expect(screen.getByText(base.content)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /masquer cette annonce/i }));
    expect(screen.queryByText(base.content)).not.toBeInTheDocument();
  });
});
