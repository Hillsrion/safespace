"use client";

import * as React from "react";
import { ListFilter } from "lucide-react"; // Removed FileText, Loader2
import { useSearchFilters } from "~/hooks/useSearchFilters";
import { MultiSelect } from "~/components/multi-select";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input"; // Added
// Removed Command imports
// import { cn } from "~/lib/utils"; // cn might not be needed if Command is gone, but other UI might use it. Keeping for now.
import type { Space } from "~/lib/types";
// Assuming PostSeverity is re-exported from generated/prisma or directly from @prisma/client
import type { Post, PostSeverity } from "~/generated/prisma"; // Changed Severity to PostSeverity

interface SearchFiltersProps {
  availableSpaces: Space[];
  userRoles: string[];
  availableSeverities: PostSeverity[]; // Updated from Severity[]
}

export function SearchFilters({
  availableSpaces,
  userRoles,
  availableSeverities,
}: SearchFiltersProps) {
  const {
    searchTerm,
    setSearchTerm,
    severity,
    setSeverity, // This setter now expects PostSeverity | null from the hook
    selectedSpaceIds,
    setSelectedSpaceIds,
    myPostsOnly,
    setMyPostsOnly,
    adminOnly,
    setAdminOnly,
    sortOptions,
    setSortOptions,
    // results, // results and loading are no longer used by this component's UI
    // loading,
  } = useSearchFilters();

  // Removed state and refs related to Command input and dropdown
  // const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  // const commandRef = React.useRef<HTMLDivElement>(null);
  // const inputRef = React.useRef<HTMLInputElement>(null);

  // Removed useEffects for Command dropdown management

  // Removed helper functions for Command results list
  // const handleSelectResult = (result: Post) => { ... };
  // const getResultDisplayData = (result: Post) => { ... };

  const selectedSpaceObjects = React.useMemo(
    () => availableSpaces.filter((space) => selectedSpaceIds.includes(space.id)),
    [availableSpaces, selectedSpaceIds]
  );

  const handleSpaceSelectionChange = (newSelectedSpaces: Space[]) => {
    setSelectedSpaceIds(newSelectedSpaces.map((space) => space.id));
  };

  const canViewAdminFilter = userRoles.includes('admin') || userRoles.includes('superadmin');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-start gap-4">
        {/* Replace Command component with Input component */}
        <Input
          type="search"
          placeholder="Search dashboard items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-10 w-full md:flex-grow md:max-w-md" // Applied similar sizing as previous div
        />

        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
          <Select 
            value={severity || ""} 
            onValueChange={(value) => setSeverity(value as PostSeverity || null)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by severity..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Severities</SelectItem>
              {/* Assuming availableSeverities is now PostSeverity[] */}
              {availableSeverities.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <MultiSelect
            elements={availableSpaces}
            selected={selectedSpaceObjects}
            onChange={handleSpaceSelectionChange}
            placeholder="Select spaces..."
            className="w-full sm:w-[250px]"
          />
          
          <div className="flex items-center space-x-2">
            <Checkbox id="myPosts" checked={myPostsOnly} onCheckedChange={(checked) => setMyPostsOnly(Boolean(checked))} />
            <Label htmlFor="myPosts" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              My Posts Only
            </Label>
          </div>

          {canViewAdminFilter && (
            <div className="flex items-center space-x-2">
              <Checkbox id="adminOnly" checked={adminOnly} onCheckedChange={(checked) => setAdminOnly(Boolean(checked))} />
              <Label htmlFor="adminOnly" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Admin Only
              </Label>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <ListFilter className="h-4 w-4" />
                Sort by
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort Options</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={sortOptions.groupBySpace}
                onCheckedChange={(checked) => setSortOptions(prev => ({ ...prev, groupBySpace: Boolean(checked) }))}
              >
                Group by Space
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={sortOptions.orderDirection === 'asc'}
                onCheckedChange={(checked) => setSortOptions(prev => ({ ...prev, orderDirection: checked ? 'asc' : 'desc' }))}
              >
                Order Ascending
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
