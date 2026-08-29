import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportForm } from "./report-form";
import type { ReportWriteResponse } from "~/lib/reports";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async (importOriginal) => ({ ...await importOriginal<typeof import("react-router")>(), useNavigate: () => navigate }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const spaceId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const entityId = "00000000-0000-4000-8000-000000000003";
const report: ReportWriteResponse = { success: true, post: {
  id: postId, spaceId, description: "Description initiale", isAnonymous: true, isAdminOnly: false,
  severity: null, verificationStatus: "unverified", requiresSensitiveReview: false, contentRevision: 1,
  createdAt: "2026-08-27", updatedAt: "2026-08-27", reportedEntity: { id: entityId, name: "Entity", handles: ["handle"] },
} };
const uploadResponse = (id: string) => Response.json({ mediaId: id, mimeType: "image/jpeg", fileSize: 100, metadataStripped: true });
function setup(sensitive = false) {
  return render(<ReportForm initialValues={{ spaceId, entity: { name: "Entity", handles: ["handle"] }, description: "Description initiale", isAnonymous: true, isAdminOnly: false, verificationStatus: "verified" }}
    method="POST" spaces={[{ id: spaceId, name: "Espace privé", role: "MODERATOR" }]} submitLabel="Enregistrer" title="Rapport" requiresSensitiveReview={sensitive} />);
}
function files(...names: string[]) {
  fireEvent.change(screen.getByLabelText("Preuves privées", { selector: "input" }), { target: { files: names.map((name) => new File(["bytes"], name, { type: "image/jpeg" })) } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

describe("report persistence and evidence recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    navigate.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("updates the existing report and retries only failed evidence after a partial upload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(report)).mockResolvedValueOnce(uploadResponse("media-1"))
      .mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(report)).mockResolvedValueOnce(uploadResponse("media-2"));
    setup(); files("first.jpg", "second.jpg"); submit();
    await screen.findByText("Échec du téléversement");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Espace")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Description du signalement"), { target: { value: "Description corrigée après upload partiel" } });
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/dashboard/entities/${entityId}`));
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.filter(([, init]) => init?.headers)).toHaveLength(2);
    expect(calls[0]).toEqual([
      `/resources/api/spaces/${spaceId}/posts`,
      expect.objectContaining({ method: "POST" }),
    ]);
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
      targetEntityName: "Entity",
      targetEntityHandles: ["handle"],
      description: "Description initiale",
    });
    expect(JSON.parse(String(calls[0][1]?.body))).not.toHaveProperty("spaceId");
    expect(JSON.parse(String(calls[0][1]?.body))).not.toHaveProperty("entity");
    expect(calls[3]).toEqual([`/resources/api/spaces/${spaceId}/posts/${postId}`, expect.objectContaining({ method: "PUT" })]);
    expect(JSON.parse(String(calls[3][1]?.body)).description).toBe("Description corrigée après upload partiel");
    const uploads = calls.filter(([url]) => url === "/resources/api/media/upload");
    expect(uploads.map(([, init]) => (init?.body as FormData).get("file") as File).map(({ name }) => name)).toEqual(["first.jpg", "second.jpg", "second.jpg"]);
    for (const [, init] of uploads) expect((init?.body as FormData).get("postId")).toBe(postId);
  });

  it("does not discard changed text by navigating automatically after an individual retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(report)).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(uploadResponse("media-1"));
    setup(); files("retry.jpg"); submit();
    await screen.findByText("Échec du téléversement");
    fireEvent.change(screen.getByLabelText("Description du signalement"), { target: { value: "Modification non enregistrée" } });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByText("Preuve image");
    expect(screen.getByLabelText("Description du signalement")).toHaveValue("Modification non enregistrée");
    expect(navigate).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retains the form and never uploads files when report saving fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "private backend diagnostic" }, { status: 403 }));
    setup(); files("proof.jpg"); submit();
    await screen.findByText("Enregistrement impossible");
    expect(screen.getByLabelText("Description du signalement")).toHaveValue("Description initiale");
    expect(screen.queryByText("private backend diagnostic")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1); expect(navigate).not.toHaveBeenCalled();
  });

  it("stops processing remaining files and ignores late results after unmount", async () => {
    let resolveUpload!: (response: Response) => void;
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(report)).mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));
    const view = setup(); files("first.jpg", "second.jpg"); submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    view.unmount();
    await act(async () => resolveUpload(uploadResponse("media-1")));
    expect(fetch).toHaveBeenCalledTimes(2); expect(navigate).not.toHaveBeenCalled();
  });

  it("never sends direct verification for a sensitive report even from a moderator form", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(report));
    setup(true); submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).not.toHaveProperty("verificationStatus");
    expect(screen.queryByRole("option", { name: "Vérifié" })).not.toBeInTheDocument();
  });

  it("previews locally with privacy indicators without submitting or uploading", async () => {
    setup(); files("draft.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Aperçu" }));
    expect(await screen.findByRole("dialog", { name: "Aperçu du signalement" })).toBeInTheDocument();
    expect(screen.getByText("Auteur anonyme")).toBeInTheDocument();
    expect(screen.getByText(/1 fichier\(s\) encore à téléverser/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps evidence revision out of the strict report update payload", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(report));
    render(<ReportForm initialValues={{ spaceId, entity: { name: "Entity", handles: ["handle"] }, description: "Rapport existant", isAnonymous: true, isAdminOnly: false, contentRevision: 7 }}
      method="PUT" postId={postId} spaces={[{ id: spaceId, name: "Espace privé", role: "EDITOR" }]} submitLabel="Enregistrer" title="Rapport" />);
    submit();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).not.toHaveProperty("contentRevision");
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("does not silently discard unsaved evidence captions when the report is submitted", async () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ media: { id: first, caption: "Première légende", evidenceCategory: "unclassified", sortOrder: 0 }, contentRevision: 2, orderedMediaIds: [first, second] }))
      .mockResolvedValueOnce(Response.json({ media: { id: second, caption: "Seconde légende", evidenceCategory: "unclassified", sortOrder: 1 }, contentRevision: 3, orderedMediaIds: [first, second] }))
      .mockResolvedValueOnce(Response.json(report));
    render(<ReportForm initialValues={{ spaceId, entity: { name: "Entity", handles: ["handle"] }, description: "Rapport existant", isAnonymous: true, isAdminOnly: false, contentRevision: 1 }}
      existingEvidence={[first, second].map((id, sortOrder) => ({ id, sortOrder, mimeType: "image/jpeg", fileSize: 100, isBlurred: true, viewerCanDelete: true }))}
      method="PUT" postId={postId} spaces={[{ id: spaceId, name: "Espace privé", role: "EDITOR" }]} submitLabel="Enregistrer" title="Rapport" />);
    fireEvent.change(screen.getAllByLabelText("Légende")[0], { target: { value: "Première légende" } });
    fireEvent.change(screen.getAllByLabelText("Légende")[1], { target: { value: "Seconde légende" } });
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aperçu" })).toBeDisabled();
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Enregistrer" }).closest("form")!); });
    expect(fetch).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Enregistrer la classification" })[0]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Enregistrer la classification" })[1]).toBeEnabled());
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    expect(screen.getAllByLabelText("Légende")[1]).toHaveValue("Seconde légende");
    fireEvent.click(screen.getAllByRole("button", { name: "Enregistrer la classification" })[1]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).expectedRevision).toBe(2);
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
