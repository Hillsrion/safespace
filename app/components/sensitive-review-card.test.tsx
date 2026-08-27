import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async () => ({ ...await vi.importActual("react-router"), useRevalidator: () => ({ revalidate }) }));
vi.mock("./media-carousel", () => ({ MediaCarousel: () => null }));
vi.mock("./media-dialog", () => ({ MediaDialog: () => null }));
import { MemoryRouter } from "react-router";
import { SensitiveReviewCard } from "./sensitive-review-card";
import type { ComponentProps } from "react";
const item: ComponentProps<typeof SensitiveReviewCard>["item"] = {
  id: "post", spaceId: "space", description: "Allegation content", isAnonymous: true, isAdminOnly: true,
  status: "active", severity: "high", requiresSensitiveReview: true, contentRevision: 2, verificationStatus: "pending",
  entity: { id: "entity", name: "Reported entity", handles: ["example"] }, media: [],
  canDecide: true, nextStage: 1,
  rounds: [{ id: "round", revision: 2, status: "pending", reason: "Sensitive allegation classification.", createdAt: "2026-08-27T12:00:00Z", decisions: [] }],
};
const show = (overrides: Partial<typeof item> = {}) => render(<MemoryRouter><SensitiveReviewCard item={{ ...item, ...overrides }} /></MemoryRouter>);
describe("SensitiveReviewCard", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => vi.unstubAllGlobals());
  it("shows the three distinct steps and waits for a meaningful rationale", () => {
    show();
    expect(screen.getByText("Modérateur de l’espace")).toBeInTheDocument();
    expect(screen.getByText("Administrateur de l’espace")).toBeInTheDocument();
    expect(screen.getByText("Superadministrateur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approuver cette étape" })).toBeDisabled();
    expect(screen.queryByText(/authorId|reviewerUserId|storageKey/)).not.toBeInTheDocument();
  });
  it("never offers an approval to an unauthorized viewer or detached author", () => {
    show({ canDecide: false, rounds: [{ ...item.rounds[0], status: "blocked" }] });
    expect(screen.getByText("Revue impossible : auteur détaché")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approuver cette étape" })).not.toBeInTheDocument();
  });
  it("submits only the expected revision/stage/outcome and revalidates after success", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));
    show(); fireEvent.change(screen.getByLabelText("Justification de votre décision"), { target: { value: "Evidence independently examined." } });
    fireEvent.click(screen.getByRole("button", { name: "Approuver cette étape" }));
    await waitFor(() => expect(revalidate).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/resources/api/spaces/space/sensitive-reviews/post", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ revision: 2, stage: 1, outcome: "approve", note: "Evidence independently examined." }) }));
  });
  it("keeps a failed/stale decision visible without claiming success", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }));
    show(); fireEvent.change(screen.getByLabelText("Justification de votre décision"), { target: { value: "Evidence independently examined." } });
    fireEvent.click(screen.getByRole("button", { name: "Demander une correction" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La révision ou l’étape a changé"));
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("classifies an unreviewed report without sending an approval", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));
    show({ requiresSensitiveReview: false, rounds: [], canDecide: false });
    fireEvent.change(screen.getByLabelText("Motif du classement sensible"), { target: { value: "Sensitive issue escalated manually." } });
    fireEvent.click(screen.getByRole("button", { name: "Exiger la revue à trois niveaux" }));
    await waitFor(() => expect(revalidate).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "POST", body: JSON.stringify({ revision: 2, reason: "Sensitive issue escalated manually." }) }));
  });
});
