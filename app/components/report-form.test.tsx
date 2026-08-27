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
    method="POST" spaces={[{ id: spaceId, name: "Espace privé", role: "MODERATOR" }]} submitLabel="Enregistrer" submitUrl="/resources/api/posts/create" title="Rapport" requiresSensitiveReview={sensitive} />);
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
    expect(calls[3]).toEqual([`/resources/api/posts/${postId}/update`, expect.objectContaining({ method: "PATCH" })]);
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
});
