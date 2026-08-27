import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
