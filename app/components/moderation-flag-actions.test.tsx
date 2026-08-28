import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("react-router", () => ({ useRevalidator: () => ({ revalidate }) }));
import { ModerationFlagActions } from "./moderation-flag-actions";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
describe("flag decision recovery", () => {
  it("does not stay pending or claim success after a failed connection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("private transport details")).mockResolvedValueOnce(Response.json({})));
    render(<ModerationFlagActions flagId="flag" spaceId="space" />);
    fireEvent.click(screen.getByRole("button", { name: "Résoudre" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Décision non confirmée");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private transport details");
    expect(revalidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rejeter" }));
    await waitFor(() => expect(revalidate).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith("/resources/api/spaces/space/moderation/flags/flag", expect.objectContaining({ body: JSON.stringify({ status: "rejected" }) }));
  });
});
