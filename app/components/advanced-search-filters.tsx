import { BookmarkPlus, BellRing } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

export type AdvancedSearchFilterValues = {
  type: "all" | "posts" | "entities";
  spaceId?: string;
  severity?: "low" | "medium" | "high";
  verification?: "unverified" | "pending" | "verified" | "disputed";
  alertEnabled: boolean;
  alertHandle: string;
};

export type SearchableSpace = { id: string; name: string };

type Props = {
  value: AdvancedSearchFilterValues;
  spaces: SearchableSpace[];
  onChange: (next: AdvancedSearchFilterValues) => void;
  onSave?: () => void;
  savedSearchName?: string;
  onSavedSearchNameChange?: (name: string) => void;
  saving?: boolean;
};

/**
 * Standalone controls for the existing command-palette search UI. The parent
 * owns execution so it can debounce requests and decide how to present saved
 * searches without duplicating result state here.
 */
export function AdvancedSearchFilters({
  value,
  spaces,
  onChange,
  onSave,
  savedSearchName = "",
  onSavedSearchNameChange,
  saving = false,
}: Props) {
  const update = (patch: Partial<AdvancedSearchFilterValues>) =>
    onChange({ ...value, ...patch });

  return (
    <section className="space-y-3 border-t pt-3" aria-label="Advanced search filters">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <FilterSelect
          label="Results"
          value={value.type}
          onValueChange={(type) => update({ type: type as AdvancedSearchFilterValues["type"] })}
          options={[
            ["all", "All"],
            ["posts", "Posts"],
            ["entities", "Reported entities"],
          ]}
        />
        <FilterSelect
          label="Space"
          value={value.spaceId ?? "all"}
          onValueChange={(spaceId) => update({ spaceId: spaceId === "all" ? undefined : spaceId })}
          options={[["all", "All spaces"], ...spaces.map((space) => [space.id, space.name])]}
        />
        <FilterSelect
          label="Severity"
          value={value.severity ?? "all"}
          onValueChange={(severity) => update({ severity: severity === "all" ? undefined : severity as AdvancedSearchFilterValues["severity"] })}
          options={[["all", "Any severity"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]]}
        />
        <FilterSelect
          label="Verification"
          value={value.verification ?? "all"}
          onValueChange={(verification) => update({ verification: verification === "all" ? undefined : verification as AdvancedSearchFilterValues["verification"] })}
          options={[["all", "Any status"], ["unverified", "Unverified"], ["pending", "Pending"], ["verified", "Verified"], ["disputed", "Disputed"]]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="saved-search-alert"
            checked={value.alertEnabled}
            onCheckedChange={(alertEnabled) => update({ alertEnabled })}
          />
          <Label htmlFor="saved-search-alert" className="flex items-center gap-1.5">
            <BellRing className="size-3.5" /> Alert for a handle
          </Label>
        </div>
        {value.alertEnabled ? (
          <Input
            aria-label="Instagram handle to watch"
            className="h-8 w-52"
            placeholder="@handle"
            value={value.alertHandle}
            onChange={(event) => update({ alertHandle: event.target.value })}
          />
        ) : null}
        {onSave ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Saved search name"
              className="h-8 w-44"
              placeholder="Search name"
              value={savedSearchName}
              onChange={(event) => onSavedSearchNameChange?.(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={saving || !savedSearchName.trim()}
            >
              <BookmarkPlus /> {saving ? "Saving…" : "Save search"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
