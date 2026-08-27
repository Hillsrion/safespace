import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), spaces: vi.fn(), data: vi.fn() }));
vi.mock("react-router", async () => ({ ...await vi.importActual("react-router"), useLoaderData: mocks.data }));
vi.mock("../../services/auth.server", () => ({ getCurrentUser: mocks.user }));
vi.mock("../../db/repositories/spaces/queries.server", () => ({ getUserSpaces: mocks.spaces }));
import Welcome, { loader } from "./welcome";

const SPACE = "11111111-1111-4111-8111-111111111111";
const load = (spaceId = SPACE) => loader({ request: new Request(`https://safe.test/dashboard/welcome?spaceId=${spaceId}`), params: {}, context: {} });

describe("space onboarding", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "member" }); });
  afterEach(cleanup);

  it("authenticates before looking up an invitation's space", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(load()).rejects.toMatchObject({ status: 302 });
    expect(mocks.spaces).not.toHaveBeenCalled();
  });

  it("does not expose missing, revoked or suspended spaces", async () => {
    mocks.spaces.mockResolvedValue([]);
    await expect(load()).rejects.toMatchObject({ status: 404 });
    await expect(load("not-a-uuid")).rejects.toMatchObject({ status: 404 });
  });

  it("returns only the selected space's safe onboarding fields", async () => {
    mocks.spaces.mockResolvedValue([{ id: SPACE, name: "Invited space", role: "EDITOR", privateNotes: "not public" }]);
    expect(await load()).toEqual({ space: { id: SPACE, name: "Invited space", role: "EDITOR" } });
  });

  it.each(["EDITOR", "Admin", "READ_ONLY"])("explains current %s access and links to the correct feed", (role) => {
    mocks.data.mockReturnValue({ space: { id: SPACE, name: "Invited space", role } });
    render(<MemoryRouter><Welcome /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Découvrir mon espace" })).toHaveAttribute("href", `/dashboard?spaceId=${SPACE}`);
    expect(screen.getByText(role === "READ_ONLY" ? /Il ne permet pas de publier/ : /Vous pouvez rédiger un signalement/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Relire la charte/ })).toHaveAttribute("href", "/community-policy");
  });
});
