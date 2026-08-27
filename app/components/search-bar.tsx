import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Bookmark,
  FileText,
  Loader2,
  Search,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AdvancedSearchFilters, type AdvancedSearchFilterValues } from "~/components/advanced-search-filters";
import { Button } from "~/components/ui/button";
import { useSearch } from "~/hooks/useSearch";
import { useSpaces } from "~/hooks/useSpaces";
import { isSearchShortcut } from "~/lib/search-shortcut";
import {
  createSavedSearch,
  listSavedSearches,
  type SavedSearch,
} from "~/services/api.client/saved-searches";
import type { SearchResultItem } from "~/services/api.client/search";

function resultLabel(result: SearchResultItem): string {
  return result.type === "post"
    ? result.data.description || "Untitled post"
    : result.data.name || "Unnamed entity";
}

function ResultItem({
  result,
  onSelect,
}: {
  result: SearchResultItem;
  onSelect: (result: SearchResultItem) => void;
}) {
  const isPost = result.type === "post";
  return (
    <CommandItem
      value={`${result.type}-${result.data.id}-${resultLabel(result)}`}
      onSelect={() => onSelect(result)}
      className="px-3 py-2.5"
    >
      {isPost ? (
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <ShieldAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="truncate">{resultLabel(result)}</span>
    </CommandItem>
  );
}

export function SearchBar() {
  const {
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    results,
    loading,
    resetSearch,
  } = useSearch();
  const { spaces } = useSpaces();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertHandle, setAlertHandle] = useState("");
  const [savedSearchName, setSavedSearchName] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modalGenerationRef = useRef(0);
  const locationKeyRef = useRef(location.key);

  const postResults = results?.filter((result) => result.type === "post") ?? [];
  const entityResults =
    results?.filter((result) => result.type === "reportedEntity") ?? [];

  const resetModal = () => {
    resetSearch();
    setShowAdvanced(false);
    setAlertEnabled(false);
    setAlertHandle("");
    setSavedSearchName("");
    setSavedSearches([]);
    setSaving(false);
    setActiveTab("posts");
  };

  const closeModal = () => {
    modalGenerationRef.current += 1;
    setIsOpen(false);
    resetModal();
    const previousFocus = previousFocusRef.current;
    requestAnimationFrame(() => previousFocus?.focus());
  };

  const openModal = () => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    modalGenerationRef.current += 1;
    setIsOpen(true);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      if (!isOpen) openModal();
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [isOpen]);

  useEffect(() => {
    if (locationKeyRef.current === location.key) return;
    locationKeyRef.current = location.key;

    if (isOpen) {
      closeModal();
    } else {
      resetModal();
    }
  }, [location.key]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const generation = modalGenerationRef.current;
    listSavedSearches()
      .then((items) => {
        if (active && generation === modalGenerationRef.current) setSavedSearches(items);
      })
      .catch(() => {
        // Saved searches are optional; do not retain an error with request data.
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const advancedValue: AdvancedSearchFilterValues = {
    ...filters,
    alertEnabled,
    alertHandle,
  };

  const handleAdvancedChange = (next: AdvancedSearchFilterValues) => {
    setFilters({
      type: next.type,
      spaceId: next.spaceId,
      severity: next.severity,
      verification: next.verification,
    });
    setAlertEnabled(next.alertEnabled);
    setAlertHandle(next.alertHandle);
  };

  const handleSaveSearch = async () => {
    if (searchTerm.trim().length < 2 || !savedSearchName.trim()) {
      toast.error("Enter a query and a name before saving the search.");
      return;
    }
    const generation = modalGenerationRef.current;
    setSaving(true);
    try {
      const saved = await createSavedSearch({
        name: savedSearchName.trim(),
        query: searchTerm.trim(),
        type: filters.type,
        spaceId: filters.spaceId,
        severity: filters.severity,
        verificationStatus: filters.verification,
        alertEnabled,
        alertHandle: alertEnabled ? alertHandle : undefined,
      });
      if (generation === modalGenerationRef.current) {
        setSavedSearches((current) => [saved, ...current]);
        setSavedSearchName("");
        toast.success("Search saved.");
      }
    } catch {
      if (generation === modalGenerationRef.current) {
        toast.error("Unable to save this search.");
      }
    } finally {
      if (generation === modalGenerationRef.current) setSaving(false);
    }
  };

  const applySavedSearch = (saved: SavedSearch) => {
    setSearchTerm(saved.query);
    setFilters({
      type: saved.type,
      spaceId: saved.spaceId ?? undefined,
      severity: saved.severity ?? undefined,
      verification: saved.verificationStatus ?? undefined,
    });
    setAlertEnabled(saved.alertEnabled);
    setAlertHandle(saved.alertHandle ?? "");
    setShowAdvanced(true);
  };

  const handleSelectResult = (result: SearchResultItem) => {
    const path =
      result.type === "post"
        ? result.data.reportedEntity?.id
          ? `/dashboard/entities/${result.data.reportedEntity.id}`
          : null
        : result.type === "reportedEntity"
          ? `/dashboard/entities/${result.data.id}`
          : null;
    if (!path) return;
    closeModal();
    navigate(path);
  };

  const renderResults = (items: SearchResultItem[], emptyLabel: string) => (
    <CommandList aria-label={activeTab === "posts" ? "Post results" : "Entity results"} className="max-h-72 px-4 pb-3">
      {loading ? (
        <div className="flex items-center justify-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Searching…
        </div>
      ) : !searchTerm.trim() ? (
        <CommandEmpty>Type to start searching.</CommandEmpty>
      ) : !items.length ? (
        <CommandEmpty>{emptyLabel}</CommandEmpty>
      ) : (
        <CommandGroup heading={activeTab === "posts" ? "Posts" : "Reported entities"}>
          {items.map((result) => (
            <ResultItem
              key={`${result.type}-${result.data.id}`}
              result={result}
              onSelect={handleSelectResult}
            />
          ))}
        </CommandGroup>
      )}
    </CommandList>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => (nextOpen ? openModal() : closeModal())}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="mx-auto flex h-10 w-full max-w-xl justify-between text-muted-foreground"
          aria-label="Open search"
        >
          <span className="flex items-center gap-2"><Search className="size-4" aria-hidden="true" />Search posts and entities…</span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-medium">⌘ K</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[min(88vh,720px)] max-w-3xl overflow-y-auto p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="border-b px-5 pb-3 pt-5">
          <DialogTitle>Search SafeSpace</DialogTitle>
          <DialogDescription>Search only the spaces you can currently access.</DialogDescription>
        </DialogHeader>
        <Command
          label="Search posts and entities"
          shouldFilter={false}
          className="rounded-none"
        >
          <CommandInput
            ref={inputRef}
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Search posts, entities…"
            aria-label="Search posts and entities"
          />
          <div className="space-y-3 border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced((current) => !current)}
                aria-expanded={showAdvanced}
              >
                <SlidersHorizontal className="size-4" /> Filters
              </Button>
              {savedSearches.length > 0 ? (
                <div className="flex max-w-full items-center gap-1 overflow-x-auto" aria-label="Saved searches">
                  {savedSearches.slice(0, 5).map((saved) => (
                    <Button key={saved.id} type="button" variant="ghost" size="sm" onClick={() => applySavedSearch(saved)}>
                      <Bookmark className="size-4" /> {saved.name}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            {showAdvanced ? (
              <AdvancedSearchFilters
                value={advancedValue}
                spaces={spaces}
                onChange={handleAdvancedChange}
                onSave={handleSaveSearch}
                savedSearchName={savedSearchName}
                onSavedSearchNameChange={setSavedSearchName}
                saving={saving}
              />
            ) : null}
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-3">
            <TabsList aria-label="Search result types">
              <TabsTrigger value="posts">Posts ({postResults.length})</TabsTrigger>
              <TabsTrigger value="entities">Entities ({entityResults.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="posts">
              {renderResults(postResults, "No matching posts.")}
            </TabsContent>
            <TabsContent value="entities">
              {renderResults(entityResults, "No matching entities.")}
            </TabsContent>
          </Tabs>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
