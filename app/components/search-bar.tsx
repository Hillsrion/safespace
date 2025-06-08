import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "~/components/ui/command";
import { FileText, ShieldAlert, Loader2 } from "lucide-react";
import { useSearch } from "~/hooks/useSearch"; // Import the new hook

interface SearchResultItemData {
  id: string;
  description?: string; 
  name?: string;        
  firstName?: string;   
  lastName?: string;    
  instagram?: string;   
  [key: string]: any; 
}

interface SearchResult {
  type: string; 
  data: SearchResultItemData;
}

export function SearchBar() {
  const { searchTerm, setSearchTerm, results, loading } = useSearch();
  const [isOpen, setIsOpen] = useState(false);

  const navigate = useNavigate();
  const commandRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Effect to open/close the list based on search term and results
  useEffect(() => {
    if (searchTerm.trim() && (results?.length || loading)) {
      setIsOpen(true);
    } else if (!searchTerm.trim() && results?.length === 0 && !loading) {
      // Close if search term is cleared and no results/loading
      // but don't close if it's just loading with an empty term for the first time.
      // setIsOpen(false); // This might be too aggressive, let onFocus/onBlur/clickOutside handle it mostly.
    }
  }, [searchTerm, results, loading]);


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commandRef.current && !commandRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectResult = (result: SearchResult) => {
    if (!result?.data?.id) {
      console.error("Selected result is invalid:", result);
      return;
    }
    let path = "";
    switch (result.type) {
      case "post": path = `/posts/${result.data.id}`; break;
      case "reportedEntity": path = `/reported-entities/${result.data.id}`; break;
      default: console.warn("Unknown result type for navigation:", result.type); return;
    }
    
    navigate(path);
    setSearchTerm(""); // Clear input using the hook's setter
    setIsOpen(false); // Close dropdown
    // Results will clear automatically via the hook when searchTerm changes
  };

  const getResultDisplayData = (result: SearchResult) => {
    const iconClass = "mr-2.5 h-4 w-4 flex-shrink-0 text-muted-foreground";
    switch (result.type) {
      case "post":
        return { text: result.data.description || "Untitled Post", icon: <FileText className={iconClass} /> };
      case "reportedEntity":
        return { text: result.data.name || "Unnamed Entity", icon: <ShieldAlert className={iconClass} /> };
      default:
        // Handle potentially unknown types gracefully if API changes or returns unexpected data
        return { text: result.data.name || result.data.description || "Unknown item", icon: null };
    }
  };
  
  const handleInputFocus = () => {
    if (searchTerm.trim() || results?.length || loading) {
      setIsOpen(true);
    }
  };
  
  const handleInputChange = (newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
    if (newSearchTerm.trim() && !isOpen) {
        setIsOpen(true);
    } else if (!newSearchTerm.trim() && !loading && results?.length === 0) {
        // If input is cleared, and not loading, and no results, keep it open to show "Type to search"
        // but allow click outside or blur to close it.
        // Or, if you prefer to close it immediately:
        // setIsOpen(false);
    }
  };


  return (
    <div ref={commandRef} className="relative w-full max-w-xl mx-auto">
      <Command shouldFilter={false} className="rounded-lg border shadow-md bg-card text-card-foreground">
        <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
          <CommandInput
            ref={inputRef}
            value={searchTerm}
            onValueChange={handleInputChange}
            placeholder="Search posts, entities..." // Updated placeholder
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onFocus={handleInputFocus}
          />
        </div>
        {isOpen && (
          <CommandList className="absolute top-full mt-1 w-full bg-card border rounded-b-lg shadow-lg max-h-[350px] overflow-y-auto z-50">
            {loading && (
              <div className="p-3 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Searching...</span>
              </div>
            )}
            {!loading && !results?.length && searchTerm.trim() && (
              <CommandEmpty className="p-4 text-sm text-center text-muted-foreground">
                No results found for "{searchTerm}".
              </CommandEmpty>
            )}
            {!loading && !results?.length && !searchTerm.trim() && (
              <CommandEmpty className="p-4 text-sm text-center text-muted-foreground">
                Type to start searching.
              </CommandEmpty>
            )}
            {!loading && results?.length && (
              <CommandGroup
                heading={
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                    Results
                  </div>
                }
                className="pt-0" 
              >
                {results?.map((result) => {
                  const { text, icon } = getResultDisplayData(result);
                  return (
                    <CommandItem
                      key={`${result.type}-${result.data.id}`}
                      onSelect={() => handleSelectResult(result)}
                      value={`searchItem-${result.type}-${result.data.id}-${text}`}
                      className="flex items-center cursor-pointer select-none rounded-sm px-3 py-2.5 text-sm hover:bg-accent aria-selected:bg-accent"
                    >
                      {icon}
                      <span className="truncate flex-grow">{text}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}