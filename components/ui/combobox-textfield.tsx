import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// 1. Interface and Mock Data
export interface Person {
  id: number;
  name: string;
  instagram: string;
}

const people: Person[] = [
  { id: 1, name: 'Alice Wonderland', instagram: '@alice_in_wonderland' },
  { id: 2, name: 'Bob The Builder', instagram: '@bob_builds' },
  { id: 3, name: 'Charlie Brown', instagram: '@charlie_goodgrief' },
  { id: 4, name: 'Diana Prince', instagram: '@wonder_woman_official' },
  { id: 5, name: 'Edward Scissorhands', instagram: '@edward_scissor_art' },
  { id: 6, name: 'Fiona Gallagher', instagram: '@fiona_southside' },
  { id: 7, name: 'George Costanza', instagram: '@artvandelay_real' },
  { id: 8, name: 'Harry Potter', instagram: '@theboywholived' },
];

// 2. Component Props
interface ComboboxTextfieldProps {
  peopleData?: Person[]; // Optional, defaults to internal mock data
  value: string;
  onChange: (value: string) => void;
  onSelect: (person: Person | null) => void;
  placeholder?: string;
  searchType?: 'name' | 'instagram';
  showConfirmation?: boolean;
}

// 3. Component Definition
const ComboboxTextfield: React.FC<ComboboxTextfieldProps> = ({
  peopleData = people, // Default to mock data if not provided
  value,
  onChange,
  onSelect,
  placeholder = 'Search or type...',
  searchType = 'name',
  showConfirmation = false,
}) => {
  const [inputValue, setInputValue] = React.useState<string>(value);
  const [selectedPerson, setSelectedPerson] = React.useState<Person | null>(null);
  const [open, setOpen] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false); // For showConfirmation logic

  // Effect to update inputValue when prop.value changes
  // Also handles external clearing of the value
  React.useEffect(() => {
    setInputValue(value);
    if (!value) {
      setSelectedPerson(null);
      setConfirmed(false);
      // onSelect(null); // Parent is clearing, so they already know. Avoids potential loop if parent uses onSelect to clear.
    } else {
      // If value is set externally and matches a person, update selectedPerson
      const matchingPerson = peopleData.find(p => 
        (searchType === 'name' ? p.name : p.instagram) === value
      );
      if (matchingPerson) {
        setSelectedPerson(matchingPerson);
        if (showConfirmation) {
          // If confirmation is required, an external value set means it's already "confirmed" implicitly
          setConfirmed(true); 
        }
        // onSelect(matchingPerson); // Avoid loop, parent already knows
      } else {
        // External value doesn't match anyone, clear selection
        setSelectedPerson(null);
        setConfirmed(false);
      }
    }
  }, [value, peopleData, searchType, showConfirmation]);

  const getDisplayValue = (person: Person | null): string => {
    if (!person) return '';
    return searchType === 'name' ? person.name : person.instagram;
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    onChange(newValue); // Notify parent of text change
    if (selectedPerson) { // If there was a selection, typing clears it
        onSelect(null); // Notify parent that prior selection is gone
    }
    setSelectedPerson(null); // Clear selection when typing
    setConfirmed(false);
    setOpen(newValue.length > 0); // Open popover if there's input
  };

  const handleSelectPerson = (person: Person) => {
    if (showConfirmation) {
      setSelectedPerson(person);
      setConfirmed(false); // Needs confirmation
      setOpen(false);
      // Do not update input value or call onSelect yet
    } else {
      const displayVal = getDisplayValue(person);
      setInputValue(displayVal);
      setSelectedPerson(person);
      onSelect(person);
      onChange(displayVal); // Also update parent's value
      setOpen(false);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedPerson) {
      const displayVal = getDisplayValue(selectedPerson);
      setInputValue(displayVal);
      setConfirmed(true);
      onSelect(selectedPerson); // Official selection
      onChange(displayVal); // Update parent's value
      setOpen(false); // Close popover if it was somehow open
    }
  };

  const handleCancelSelection = () => {
    setSelectedPerson(null);
    setConfirmed(false);
    // Don't clear inputValue here, allow user to continue typing or clear explicitly
    onSelect(null); // Notify parent that selection was cancelled
  };

  const handleClear = () => {
    setInputValue('');
    setSelectedPerson(null);
    setConfirmed(false);
    onChange('');
    onSelect(null);
    setOpen(false);
  };

  const filteredPeople = React.useMemo(() => {
    // If input is empty, or if a person is selected & confirmed, don't show list for further filtering.
    // Exception: if in confirmation mode and selected but not confirmed, still filter to allow changing mind.
    if (!inputValue && (!selectedPerson || confirmed)) return [];
    if (selectedPerson && confirmed && !open) return []; // Don't refilter if selection is firm and popover closed

    return peopleData.filter((person) => {
      // If a person is selected but not confirmed (confirmation mode),
      // we might want to show them in the list if they still match the input value.
      // Or, always show all matching if input is present.
      const targetField = searchType === 'name' ? person.name : person.instagram;
      return targetField.toLowerCase().includes(inputValue.toLowerCase());
    });
  }, [inputValue, peopleData, searchType, selectedPerson, confirmed, open]);

  const showClearButton = inputValue.length > 0 && !(selectedPerson && !confirmed && showConfirmation);
  const showConfirmCancelButtons = selectedPerson && !confirmed && showConfirmation;
  const showChevron = !showConfirmCancelButtons;

  // Determine if the popover should be open
  // It opens if `open` is true AND there's input OR (it's in confirmation mode waiting for action)
  // AND there are items to show (or it's empty and we want to show "no results")
  const isPopoverOpen = open && (inputValue.length > 0 || (selectedPerson && !confirmed && showConfirmation));

  return (
    <div className="w-full">
      <Popover open={isPopoverOpen} onOpenChange={setOpen}>
        <div className="relative">
          <PopoverTrigger asChild className="w-full">
            {/* Using a div to ensure PopoverTrigger behavior with multiple items inside */}
            <div className="flex items-center w-full relative">
              <Input
                type="text"
                placeholder={placeholder}
                value={inputValue}
                onChange={handleInputChange}
                onClick={() => { // Open popover on click if there's text or waiting for confirmation
                  if (inputValue.length > 0 || (selectedPerson && !confirmed && showConfirmation)) {
                    setOpen(true);
                  }
                }}
                className={cn(
                  'w-full',
                  // Adjust padding dynamically based on visible icons
                  showConfirmCancelButtons ? 'pr-[calc(1rem+1rem+0.5rem+0.5rem)]' : 'pr-10', // Space for 2 small icons + chevron or 1 icon + chevron
                  selectedPerson && confirmed && 'border-green-500 focus:border-green-700',
                  selectedPerson && !confirmed && showConfirmation && 'border-yellow-500 focus:border-yellow-700'
                )}
                aria-autocomplete="list"
                aria-expanded={open}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                {showConfirmCancelButtons && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon_sm"
                      onClick={(e) => { e.stopPropagation(); handleConfirmSelection(); }}
                      aria-label="Confirm selection"
                    >
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon_sm"
                      onClick={(e) => { e.stopPropagation(); handleCancelSelection(); }}
                      aria-label="Cancel selection"
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </>
                )}
                {showClearButton && !showConfirmCancelButtons && ( // Only show clear if not in confirm/cancel mode
                   <Button
                    variant="ghost"
                    size="icon_sm"
                    onClick={(e) => { e.stopPropagation(); handleClear(); }}
                    aria-label="Clear input"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {showChevron && (
                 <Button
                    variant="ghost"
                    size="icon_sm"
                    onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev); }}
                    aria-label={open ? "Close suggestions" : "Open suggestions"}
                    className="opacity-50"
                 >
                    <ChevronsUpDown className="h-4 w-4" />
                 </Button>
                )}
              </div>
            </div>
          </PopoverTrigger>
        </div>

        {isPopoverOpen && (
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            {/* Command component for the search list */}
            <Command shouldFilter={false}> {/* We provide already filtered items or handle search within CommandInput */}
              <CommandInput
                value={inputValue} // Bind to external input value to continue search
                onValueChange={(currentSearchValue) => {
                  // If user types in CommandInput, update main inputValue
                  // This isn't ideal as it fights with the main input.
                  // Better: let CommandInput filter the 'filteredPeople' list if needed,
                  // or simply rely on the main input's filtering.
                  // For now, let's keep it simple: main input drives filtering.
                  // The CommandInput is more for show here or for an internal re-filter if desired.
                  // To make CommandInput actually filter, we'd pass `peopleData` to CommandGroup
                  // and let CommandInput do its job, removing our external `filteredPeople`.
                  // Sticking with external filtering for now.
                }}
                placeholder={`Search by ${searchType}...`}
                className="h-9"
              />
              <CommandList>
                <CommandEmpty>
                  {filteredPeople.length === 0 && inputValue.length > 0 ? 'No results found.' : (inputValue.length === 0 ? 'Type to search...' : '')}
                </CommandEmpty>
                {filteredPeople.length > 0 && (
                  <CommandGroup>
                    {filteredPeople.map((person) => (
                      <CommandItem
                        key={person.id}
                        // Pass a string value that Command can use for its internal accessibility and navigation logic
                        value={`${person.name} ${person.instagram}`}
                        onSelect={() => {
                          handleSelectPerson(person);
                        }}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            // Show check if this person is the one selected (even if pending confirmation)
                            selectedPerson?.id === person.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{person.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {person.instagram}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        )}
      </Popover>

      {/* Display confirmed selection details */}
      {selectedPerson && (confirmed || (!showConfirmation && selectedPerson)) && (
        <div className="mt-2 p-2 border rounded-md bg-muted text-sm">
          <p className="font-semibold">Selected:</p>
          <p>Name: {selectedPerson.name}</p>
          <p>Instagram: {selectedPerson.instagram}</p>
        </div>
      )}

      <p className="text-sm text-muted-foreground mt-2">
        {showConfirmation 
          ? "Type to search. Select a person, then confirm or cancel your choice using the icons."
          : "Type to search and select a person from the list."}
        <br/>
        Searching by: {searchType === 'name' ? 'Name' : 'Instagram Handle'}.
      </p>
    </div>
  );
};

export default ComboboxTextfield;
