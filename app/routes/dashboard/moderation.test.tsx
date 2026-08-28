import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), spaces: vi.fn(), flags: vi.fn(), appeals: vi.fn(), members: vi.fn(), data: vi.fn() }));
vi.mock("../../services/auth.server", () => ({ getCurrentUser: mocks.user }));
vi.mock("../../db/repositories/spaces/queries.server", () => ({ getUserSpaces: mocks.spaces }));
vi.mock("../../db/repositories/posts/flags.server", () => ({ listModerationFlags: mocks.flags }));
vi.mock("../../services/moderation-governance.server", () => ({ listModerationAppeals: mocks.appeals }));
vi.mock("../../db/client.server", () => ({ prisma: { userSpaceMembership: { findMany: mocks.members } } }));
vi.mock("../../components/member-governance-panel", () => ({ MemberGovernancePanel: () => null }));
vi.mock("../../components/moderation-appeal-actions", () => ({ ModerationAppealActions: () => null }));
vi.mock("react-router", async () => ({ ...await vi.importActual("react-router"), useLoaderData: mocks.data, Form: ({ children, ...props }: any) => <form {...props}>{children}</form> }));
import { MemoryRouter } from "react-router";
import ModerationPage, { loader } from "./moderation";
const flagCursor = "11111111-1111-4111-8111-111111111111";
const appealCursor = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "moderator" });
  mocks.spaces.mockResolvedValue([{ id: "space", name: "My space", role: "MODERATOR" }]);
  mocks.flags.mockResolvedValue({ flags: [], nextCursor: flagCursor, hasNextPage: true });
  mocks.appeals.mockResolvedValue({ appeals: [], nextCursor: appealCursor, hasMore: true });
  mocks.members.mockResolvedValue([]);
});
describe("moderation queue paging", () => {
  it("passes each validated cursor to its own queue", async () => {
    await loader({ request: new Request(`https://safe.test/dashboard/moderation?flagCursor=${flagCursor}&appealCursor=${appealCursor}`), params: {}, context: {} });
    expect(mocks.flags).toHaveBeenCalledWith({ id: "moderator" }, { spaceId: "space", status: "pending_review", limit: 50, cursor: flagCursor });
    expect(mocks.appeals).toHaveBeenCalledWith({ id: "moderator" }, "space", { status: "pending", limit: 50, cursor: appealCursor });
  });
  it("rejects malformed cursors before querying either queue", async () => {
    await expect(loader({ request: new Request("https://safe.test/dashboard/moderation?appealCursor=bad"), params: {}, context: {} })).rejects.toMatchObject({ status: 400 });
    expect(mocks.flags).not.toHaveBeenCalled(); expect(mocks.appeals).not.toHaveBeenCalled();
  });
  it("provides next-page and reset links for both queues", () => {
    mocks.data.mockReturnValue({ spaces: [{ id: "space", name: "My space" }], selectedSpaceId: "space", status: "pending_review", members: [],
      flagCursor, appealCursor,
      queue: { flags: [], nextCursor: appealCursor }, appeals: { appeals: [], nextCursor: flagCursor },
    });
    render(<MemoryRouter><ModerationPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Signalements suivants" })).toHaveAttribute("href", `/?spaceId=space&status=pending_review&flagCursor=${appealCursor}&appealCursor=${appealCursor}`);
    expect(screen.getByRole("link", { name: "Premiers appels" })).toHaveAttribute("href", `/?spaceId=space&status=pending_review&flagCursor=${flagCursor}`);
    expect(screen.getByRole("link", { name: "Appels suivants" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Premiers signalements" })).toBeInTheDocument();
  });
});
