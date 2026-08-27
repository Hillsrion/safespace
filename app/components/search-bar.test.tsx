import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { key: "initial", pathname: "/dashboard", search: "", hash: "", state: null },
  setSearchTerm: vi.fn(),
  setFilters: vi.fn(),
  resetSearch: vi.fn(),
  useSearch: vi.fn(),
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks/useSearch", () => ({ useSearch: mocks.useSearch }));
vi.mock("../hooks/useSpaces", () => ({ useSpaces: () => ({ spaces: [] }) }));
vi.mock("../services/api.client/saved-searches", () => ({
  listSavedSearches: mocks.listSavedSearches,
  createSavedSearch: mocks.createSavedSearch,
}));

import { SearchBar } from "./search-bar";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView ??= () => undefined;
});

const searchState = {
  searchTerm: "incident",
  setSearchTerm: mocks.setSearchTerm,
  filters: { type: "all" as const },
  setFilters: mocks.setFilters,
  results: [
    {
      type: "post",
      data: {
        id: "post-1",
        description: "Visible post result",
        reportedEntity: { id: "entity-1" },
        author: { email: "author@example.test" },
      },
    },
    {
      type: "reportedEntity",
      data: { id: "entity-1", name: "Visible entity result" },
    },
  ],
  loading: false,
  resetSearch: mocks.resetSearch,
};

describe("SearchBar floating dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.location = { key: "initial", pathname: "/dashboard", search: "", hash: "", state: null };
    mocks.useSearch.mockReturnValue(searchState);
    mocks.listSavedSearches.mockResolvedValue([]);
  });

  afterEach(() => document.body.focus());

  it("opens with Cmd/Ctrl+K, focuses the query, and restores focus after Escape", async () => {
    render(<SearchBar />);
    const trigger = screen.getByRole("button", { name: "Open search" });
    trigger.focus();

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "Search posts and entities" });
    await waitFor(() => expect(input).toHaveFocus());
    const resultList = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", resultList.id);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.resetSearch).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("opens from the search bar and separates post and entity result tabs", async () => {
    render(<SearchBar />);
    fireEvent.click(screen.getByRole("button", { name: "Open search" }));

    expect(await screen.findByText("Visible post result")).toBeInTheDocument();
    expect(screen.queryByText("author@example.test")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Entities (1)" }));
    expect(screen.getByRole("tabpanel", { name: "Entities (1)" })).toBeInTheDocument();
    expect(await screen.findByText("Visible entity result")).toBeInTheDocument();
    expect(screen.queryByText("Visible post result")).not.toBeInTheDocument();
  });

  it("clears transient search state before navigation", async () => {
    render(<SearchBar />);
    fireEvent.click(screen.getByRole("button", { name: "Open search" }));
    fireEvent.click(await screen.findByText("Visible post result"));

    expect(mocks.resetSearch).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard/entities/entity-1");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("selects the highlighted result with ArrowDown and Enter", async () => {
    render(<SearchBar />);
    fireEvent.click(screen.getByRole("button", { name: "Open search" }));
    const input = await screen.findByRole("combobox", { name: "Search posts and entities" });

    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard/entities/entity-1");
    expect(mocks.resetSearch).toHaveBeenCalled();
  });

  it("resets the open dialog after an external location change", async () => {
    const view = render(<SearchBar />);
    fireEvent.click(screen.getByRole("button", { name: "Open search" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    mocks.location = { key: "new-location", pathname: "/dashboard/entities/entity-1", search: "", hash: "", state: null };
    view.rerender(<SearchBar />);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.resetSearch).toHaveBeenCalled();
  });

  it("ignores a saved-search completion after the dialog has closed", async () => {
    let resolveSave!: (value: {
      id: string;
      name: string;
      query: string;
      type: "all";
      spaceId: null;
      severity: null;
      verificationStatus: null;
      alertEnabled: boolean;
      alertHandle: null;
      createdAt: string;
      updatedAt: string;
    }) => void;
    mocks.createSavedSearch.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    render(<SearchBar />);
    fireEvent.click(screen.getByRole("button", { name: "Open search" }));
    fireEvent.click(await screen.findByRole("button", { name: /filters/i }));
    await userEvent.type(screen.getByRole("textbox", { name: "Saved search name" }), "Private search");
    fireEvent.click(screen.getByRole("button", { name: /save search/i }));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    resolveSave({
      id: "saved-1",
      name: "Private search",
      query: "incident",
      type: "all",
      spaceId: null,
      severity: null,
      verificationStatus: null,
      alertEnabled: false,
      alertHandle: null,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    });
    await Promise.resolve();

    expect(screen.queryByText("Private search")).not.toBeInTheDocument();
    expect(mocks.createSavedSearch).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
