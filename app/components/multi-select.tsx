"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge"; // Corrected path
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"; // Corrected path
import { Command as CommandPrimitive } from "cmdk";

// Use the Space type defined in the previous step
import type { Space } from "~/lib/types"; // Corrected path

// Props for the MultiSelect component
interface MultiSelectProps {
  elements: Space[]; // Use Space type for elements
  selected: Space[];
  onChange: (selected: Space[]) => void; // Callback for when selection changes
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  elements,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
}: MultiSelectProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const handleUnselect = React.useCallback(
    (el: Space) => {
      onChange(selected.filter((s) => s.id !== el.id)); // Use id for comparison
    },
    [selected, onChange],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (input) {
        if (e.key === "Delete" || e.key === "Backspace") {
          if (input.value === "") {
            // Make a copy and remove the last selected item
            const newSelected = [...selected];
            newSelected.pop();
            onChange(newSelected);
          }
        }
        if (e.key === "Escape") {
          input.blur();
        }
      }
    },
    [selected, onChange], // Added selected and onChange to dependencies
  );

  // Filter out already selected elements and elements that don't match the inputValue
  const selectables = elements.filter(el =>
    !selected.some(s => s.id === el.id) && // Use id for comparison
    el.name.toLowerCase().includes(inputValue.toLowerCase()) // Filter by name based on inputValue
  );

  return (
    <Command
      onKeyDown={handleKeyDown}
      className={cn("overflow-visible bg-transparent", className)} // Added className prop
    >
      <div className="group rounded-md border border-input px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <div className="flex flex-wrap gap-1">
          {selected.map((item) => { // Changed framework to item
            return (
              <Badge key={item.id} variant="secondary"> {/* Use id for key */}
                {item.name} {/* Use name for display */}
                <button
                  className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUnselect(item);
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleUnselect(item)}
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </Badge>
            );
          })}
          <CommandPrimitive.Input
            ref={inputRef}
            value={inputValue}
            onValueChange={setInputValue}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="ml-2 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="relative mt-2">
        <CommandList>
          {open && selectables.length > 0 ? (
            <div className="absolute top-0 z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
              <CommandGroup className="h-full overflow-auto">
                {selectables.map((item) => { // Changed framework to item
                  return (
                    <CommandItem
                      key={item.id} // Use id for key
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onSelect={() => { // Removed unused 'value' parameter
                        setInputValue("");
                        onChange([...selected, item]); // Add new item to selection
                      }}
                      className={"cursor-pointer"}
                    >
                      {item.name} {/* Use name for display */}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ) : null}
        </CommandList>
      </div>
    </Command>
  );
}

// Helper cn function (if not already globally available or in a utils file)
// For now, assuming cn is available, e.g. from "@/lib/utils"
import { cn } from "~/lib/utils"; // Corrected path
