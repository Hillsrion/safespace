import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router", async () => ({ ...await vi.importActual<typeof import("react-router")>("react-router"), useRevalidator: () => ({ revalidate: vi.fn() }) }));
import { SystemAnnouncementManager } from "./system-announcement-manager";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("system announcement manager", () => {
  it("shows a safe failure when publishing fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Publication impossible." }), { status: 500, headers: { "Content-Type": "application/json" } })));
    render(<SystemAnnouncementManager announcements={[]} />);
    fireEvent.change(screen.getByLabelText("Texte de l’annonce"), { target: { value: "Maintenance" } });
    fireEvent.click(screen.getByRole("button", { name: "Publier l’annonce" }));
    await waitFor(() => expect(screen.getByText("Publication impossible.")).toBeTruthy());
  });
  it("edits in the dated form without submitting until confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const notice = { id: "notice", content: "Current notice", publishedAt: "2026-08-28T10:00:00.000Z", expiresAt: null, updatedAt: "2026-08-28T09:00:00.000Z" };
    render(<SystemAnnouncementManager announcements={[notice]} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByLabelText("Texte de l’annonce")).toHaveValue(notice.content);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Texte de l’annonce"), { target: { value: "Corrected notice" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/resources/api/superadmin/announcements/notice", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ content: "Corrected notice", publishedAt: notice.publishedAt, expiresAt: null }) }));
  });
  it("rejects invalid or reversed dates without making a request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<SystemAnnouncementManager announcements={[]} />);
    fireEvent.change(screen.getByLabelText("Texte de l’annonce"), { target: { value: "Notice" } });
    fireEvent.change(screen.getByLabelText("Date de publication"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "Publier l’annonce" }).closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("date valide");
    fireEvent.change(screen.getByLabelText("Date de publication"), { target: { value: "2026-08-28T12:00" } });
    fireEvent.change(screen.getByLabelText("Date d’expiration"), { target: { value: "2026-08-28T11:00" } });
    fireEvent.submit(screen.getByRole("button", { name: "Publier l’annonce" }).closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("L’expiration doit suivre la publication");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
