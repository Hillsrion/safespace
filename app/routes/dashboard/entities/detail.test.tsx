import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getEntity: vi.fn(),
  trackVisitedSpace: vi.fn(),
}));

vi.mock("../../../services/auth.server", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../services/reported-entity-member.server", () => ({
  getReportedEntityForMemberById: mocks.getEntity,
}));
vi.mock("../../../services/space-activity-tracking.server", () => ({
  trackVisitedSpace: mocks.trackVisitedSpace,
}));

import {
  EntityPostsPagination,
} from "../../../components/reported-entity-dashboard-detail";
import { loader } from "./detail";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";

describe("reported entity dashboard detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "member" });
    mocks.getEntity.mockResolvedValue({
      entity: {
        id: ENTITY_ID,
        spaceId: SPACE_ID,
        name: "Entité test",
        handles: [],
      },
      posts: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          authorId: null,
          isAnonymous: true,
          isAdminOnly: false,
          status: "active",
          severity: "low",
          verificationStatus: "pending",
          requiresSensitiveReview: false,
          description: "Signalement privé",
          createdAt: new Date("2026-08-29T10:00:00.000Z"),
          updatedAt: new Date("2026-08-29T10:00:00.000Z"),
          author: {
            id: "anonymous",
            firstName: "Anonymous",
            lastName: "",
            instagram: null,
          },
          space: { id: SPACE_ID, name: "Espace test" },
          reportedEntity: { id: ENTITY_ID, name: "Entité test", handles: [] },
          media: [],
          viewerRole: "EDITOR",
          viewerCanEdit: true,
          viewerCanDelete: false,
          viewerCanModerate: false,
        },
      ],
      page: 2,
      limit: 20,
      totalPosts: 41,
      totalPages: 3,
    });
  });

  it("validates the path, bounds paging, and delegates to the scoped member read", async () => {
    const result = await loader({
      request: new Request(`https://safe.test/dashboard/entities/${ENTITY_ID}?page=2`),
      params: { id: ENTITY_ID },
      context: {},
    });

    expect(mocks.getEntity).toHaveBeenCalledWith("member", ENTITY_ID, {
      page: 2,
      limit: 20,
    });
    expect(mocks.trackVisitedSpace).toHaveBeenCalledWith("member", SPACE_ID);
    const payload = (result as { data: unknown }).data;
    expect(payload).toMatchObject({ page: 2, totalPages: 3 });
    expect(JSON.stringify(payload)).not.toContain("authorId");
    expect(payload).toMatchObject({
      posts: [{
        author: { id: "anonymous", name: "Anonymous" },
        currentUser: { id: "member", role: "user" },
      }],
    });
  });

  it("rejects malformed entity ids and pages before the read service", async () => {
    await expect(loader({
      request: new Request("https://safe.test/dashboard/entities/not-a-uuid"),
      params: { id: "not-a-uuid" },
      context: {},
    })).rejects.toMatchObject({ status: 400 });
    await expect(loader({
      request: new Request(`https://safe.test/dashboard/entities/${ENTITY_ID}?page=1001`),
      params: { id: ENTITY_ID },
      context: {},
    })).rejects.toMatchObject({ status: 400 });
    expect(mocks.getEntity).not.toHaveBeenCalled();
  });

  it("redirects a valid but out-of-range page to the final available page", async () => {
    mocks.getEntity.mockResolvedValue({
      entity: { id: ENTITY_ID, spaceId: SPACE_ID, name: "Entité test", handles: [] },
      posts: [],
      page: 4,
      limit: 20,
      totalPosts: 1,
      totalPages: 1,
    });

    const response = await loader({
      request: new Request(`https://safe.test/dashboard/entities/${ENTITY_ID}?page=4`),
      params: { id: ENTITY_ID },
      context: {},
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe(
      `/dashboard/entities/${ENTITY_ID}?page=1`
    );
    expect(mocks.trackVisitedSpace).not.toHaveBeenCalled();
  });

  it("renders bounded previous and next links", () => {
    render(
      <MemoryRouter>
        <EntityPostsPagination entityId={ENTITY_ID} page={2} totalPages={3} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Précédent" })).toHaveAttribute(
      "href",
      `/dashboard/entities/${ENTITY_ID}?page=1`
    );
    expect(screen.getByRole("link", { name: "Suivant" })).toHaveAttribute(
      "href",
      `/dashboard/entities/${ENTITY_ID}?page=3`
    );
    expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
  });
});
