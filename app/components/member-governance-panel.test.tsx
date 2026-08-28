import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemberGovernancePanel } from "./member-governance-panel";

const members = ["alice", "bob"].map((id) => ({ role: "EDITOR", user: { id, firstName: id, lastName: "Membre" } }));
const history = (id: string) => ({
  member: { ...members.find((member) => member.user.id === id)!.user, role: "EDITOR" },
  disciplinaryActions: [{ id: `measure-${id}`, kind: "warning", level: 1, reason: `Motif privé de ${id}`, status: "active", expiresAt: null, createdAt: "2026-08-27T12:00:00Z" }],
  appeals: [], auditEvents: [],
});
afterEach(() => vi.unstubAllGlobals());
describe("member moderation history", () => {
  it("ignores a late response from the previous member even if fetch ignores abort", async () => {
    let resolveAlice!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveAlice = resolve; }))
      .mockResolvedValueOnce(Response.json(history("bob")));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemberGovernancePanel members={members} spaceId="space" />);
    fireEvent.change(screen.getByLabelText("Motif de la mesure"), { target: { value: "Brouillon pour Alice" } });
    fireEvent.change(screen.getByLabelText("Membre"), { target: { value: "bob" } });
    expect(screen.getByLabelText("Motif de la mesure")).toHaveValue("");
    await screen.findByText("Motif privé de bob");
    await act(async () => { resolveAlice(Response.json(history("alice"))); });
    expect(screen.queryByText("Motif privé de alice")).not.toBeInTheDocument();
    expect(screen.getByText("Motif privé de bob")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("keeps mutation controls recoverable after a network failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(history("alice"))).mockRejectedValueOnce(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemberGovernancePanel members={members} spaceId="space" />);
    await screen.findByText("Motif privé de alice");
    fireEvent.change(screen.getByLabelText("Motif de la mesure"), { target: { value: "Justification rédigée" } });
    fireEvent.click(screen.getByRole("button", { name: "Appliquer la prochaine mesure progressive" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText("Membre")).toBeEnabled();
    expect(screen.getByLabelText("Motif de la mesure")).toHaveValue("Justification rédigée");
    expect(screen.getByRole("button", { name: "Appliquer la prochaine mesure progressive" })).toBeEnabled();
  });
});
