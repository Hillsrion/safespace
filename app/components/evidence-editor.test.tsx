import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceEditor, type ExistingEvidence } from "./evidence-editor";
import { StrictMode } from "react";

const evidence: ExistingEvidence = {
  id: "11111111-1111-4111-8111-111111111111",
  mimeType: "image/jpeg",
  fileSize: 1024,
  isBlurred: true,
  viewerCanDelete: true,
};

function renderEditor(initialEvidence: ExistingEvidence[] = [evidence]) {
  return render(
    <EvidenceEditor
      existingEvidence={initialEvidence}
      pendingEvidence={[]}
      onFilesSelected={vi.fn()}
      onRetry={vi.fn()}
    />
  );
}

describe("EvidenceEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps evidence visible when the server refuses deletion and never renders uploader data", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    renderEditor();

    const preview = screen.getByRole("img", { name: "Aperçu flouté de la preuve 1" });
    expect(preview).toHaveClass("blur-2xl");
    expect(screen.queryByText(/uploader|author@example/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => expect(screen.getByText("Suppression impossible. La preuve est conservée.")).toBeInTheDocument());
    expect(screen.getByText("Preuve image")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `/resources/api/media/${evidence.id}`,
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
  });

  it("ignores a late deletion response after refreshed evidence arrives", async () => {
    let resolveDelete!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    const view = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    view.rerender(
      <EvidenceEditor
        existingEvidence={[evidence]}
        pendingEvidence={[]}
        onFilesSelected={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    resolveDelete(new Response(null, { status: 200 }));

    await waitFor(() => expect(screen.getByText("Preuve image")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeEnabled();
  });

  it("removes a proof successfully in StrictMode and notifies the parent", async () => {
    const onDeleted = vi.fn();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    render(<StrictMode><EvidenceEditor existingEvidence={[evidence]} pendingEvidence={[]} onFilesSelected={vi.fn()} onRetry={vi.fn()} onDeleted={onDeleted} /></StrictMode>);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
    await waitFor(() => expect(screen.queryByText("Preuve image")).not.toBeInTheDocument());
    expect(onDeleted).toHaveBeenCalledWith(evidence.id);
  });

  it("only opens the full proof after an explicit interaction", async () => {
    renderEditor();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Afficher la preuve 1" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preuve 1" })).not.toHaveClass("blur-2xl");
  });

  it("patches category metadata with the expected revision and refreshes it", async () => {
    const onRevisionChange = vi.fn();
    vi.mocked(fetch).mockResolvedValue(Response.json({ media: { ...evidence, evidenceCategory: "document", caption: null, sortOrder: 0 }, contentRevision: 2, orderedMediaIds: [evidence.id] }));
    render(<EvidenceEditor existingEvidence={[evidence]} pendingEvidence={[]} onFilesSelected={vi.fn()} onRetry={vi.fn()} expectedRevision={1} onRevisionChange={onRevisionChange} />);
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "document" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la classification" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/resources/api/media/${evidence.id}`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedRevision: 1, evidenceCategory: "document", caption: null }) })));
    expect(onRevisionChange).toHaveBeenCalledWith(2);
  });

  it("reorders two editable proofs using the canonical server order", async () => {
    const second = { ...evidence, id: "22222222-2222-4222-8222-222222222222", sortOrder: 1 };
    const onEvidenceChanged = vi.fn();
    vi.mocked(fetch).mockResolvedValue(Response.json({ media: { id: evidence.id, sortOrder: 1, evidenceCategory: "photo", caption: "Première preuve" }, contentRevision: 2, orderedMediaIds: [second.id, evidence.id] }));
    render(<EvidenceEditor existingEvidence={[{ ...evidence, sortOrder: 0 }, second]} pendingEvidence={[]} onFilesSelected={vi.fn()} onRetry={vi.fn()} expectedRevision={1} onEvidenceChanged={onEvidenceChanged} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Descendre" })[0]);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/resources/api/media/${evidence.id}`, expect.objectContaining({ body: JSON.stringify({ expectedRevision: 1, orderedMediaIds: [second.id, evidence.id] }) })));
    await waitFor(() => expect(onEvidenceChanged).toHaveBeenCalledWith([
      expect.objectContaining({ id: second.id, sortOrder: 0, viewerCanDelete: true }),
      expect.objectContaining({ id: evidence.id, sortOrder: 1, evidenceCategory: "photo", caption: "Première preuve", viewerCanDelete: true }),
    ]));
    expect(screen.getByRole("img", { name: "Aperçu flouté de la preuve 1" })).toHaveAttribute("src", `/resources/api/media/${second.id}`);
    expect(screen.queryByText(/Modification impossible/)).not.toBeInTheDocument();
  });

  it("retains the caption draft after a revision conflict without exposing server diagnostics", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: "private backend diagnostic" }, { status: 409 }));
    const onEvidenceChanged = vi.fn();
    render(<EvidenceEditor existingEvidence={[evidence]} pendingEvidence={[]} onFilesSelected={vi.fn()} onRetry={vi.fn()} expectedRevision={1} onEvidenceChanged={onEvidenceChanged} />);
    fireEvent.change(screen.getByLabelText("Légende"), { target: { value: "Brouillon à conserver" } });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la classification" }));
    await screen.findByText("La preuve a changé. Actualisez le rapport avant de réessayer.");
    expect(screen.getByLabelText("Légende")).toHaveValue("Brouillon à conserver");
    expect(screen.getByRole("button", { name: "Enregistrer la classification" })).toBeEnabled();
    expect(screen.queryByText("private backend diagnostic")).not.toBeInTheDocument();
    expect(onEvidenceChanged).not.toHaveBeenCalled();
  });

  it("ignores a late metadata response after a refreshed proof arrives", async () => {
    let resolvePatch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));
    const onRevisionChange = vi.fn();
    const props = { pendingEvidence: [], onFilesSelected: vi.fn(), onRetry: vi.fn(), onRevisionChange };
    const view = render(<EvidenceEditor {...props} existingEvidence={[evidence]} expectedRevision={1} />);
    fireEvent.change(screen.getByLabelText("Légende"), { target: { value: "Old draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la classification" }));
    view.rerender(<EvidenceEditor {...props} existingEvidence={[{ ...evidence, caption: "Nouvelle version" }]} expectedRevision={3} />);
    await act(async () => resolvePatch(Response.json({ media: { id: evidence.id, caption: "Old draft", evidenceCategory: "photo", sortOrder: 0 }, contentRevision: 2, orderedMediaIds: [evidence.id] })));
    expect(screen.getByLabelText("Légende")).toHaveValue("Nouvelle version");
    expect(onRevisionChange).not.toHaveBeenCalled();
  });

  it("does not render edit controls to a read-only viewer", () => {
    render(<EvidenceEditor existingEvidence={[{ ...evidence, viewerCanDelete: false }]} pendingEvidence={[]} onFilesSelected={vi.fn()} onRetry={vi.fn()} expectedRevision={1} />);
    expect(screen.queryByRole("button", { name: "Enregistrer la classification" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Monter" })).not.toBeInTheDocument();
  });
});
