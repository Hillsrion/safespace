import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({ revalidate: vi.fn() }));

vi.mock("react-router", async () => ({
  ...await vi.importActual<typeof import("react-router")>("react-router"),
  useRevalidator: () => ({ revalidate: routerMocks.revalidate }),
}));

import { ReportedEntityAdminActions } from "./reported-entity-admin-controls";

const entity = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Entité",
  spaceId: "22222222-2222-4222-8222-222222222222",
  handles: [{
    id: "44444444-4444-4444-8444-444444444444",
    handle: "example.account",
    platform: "Instagram",
    reviewStatus: "unreviewed",
    reviewNote: null,
    reviewedAt: null,
  }],
  postCount: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("reported entity internal handle review", () => {
  it("states the limited meaning, requires a reason and submits the scoped review", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportedEntityAdminActions entity={entity} />);

    fireEvent.click(screen.getByRole("button", { name: "Revue interne" }));
    expect(screen.getByText(/ne confirme ni l’existence ni la propriété/i)).toBeInTheDocument();
    expect(screen.getByText(/Revue interne actuelle : Non examiné/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Statut interne"), {
      target: { value: "consistent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByRole("alert")).toHaveTextContent("3 à 500 caractères");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Justification requise"), {
      target: { value: "Le nom et le contexte correspondent." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/resources/api/spaces/22222222-2222-4222-8222-222222222222/entities/33333333-3333-4333-8333-333333333333/handles/44444444-4444-4444-8444-444444444444/review",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({
          status: "consistent",
          note: "Le nom et le contexte correspondent.",
        }),
      })
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("Revue interne enregistrée");
    expect(routerMocks.revalidate).toHaveBeenCalledOnce();
  });

  it("resets a review without sending or retaining its note", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportedEntityAdminActions entity={{
      ...entity,
      handles: [{
        ...entity.handles[0],
        reviewStatus: "questionable",
        reviewNote: "Contexte insuffisant.",
        reviewedAt: "2026-08-29T10:00:00.000Z",
      }],
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Revue interne" }));
    fireEvent.change(screen.getByLabelText("Statut interne"), {
      target: { value: "unreviewed" },
    });
    expect(screen.getByLabelText(/Justification/)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/handles/44444444-4444-4444-8444-444444444444/review"),
      expect.objectContaining({ body: JSON.stringify({ status: "unreviewed" }) })
    ));
  });
});
