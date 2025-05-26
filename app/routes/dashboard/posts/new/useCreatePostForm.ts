import { useState, useEffect, useCallback } from "react";
import type { Person } from "~/components/ui/combobox-textfield"; // Assuming Person is exported
import { PostSeverity } from "~/generated/prisma"; // Path to Prisma enum
import type { ImageUploadRef } from "~/components/ui/image-upload"; // If needed for reset

// Type for submitted values, mirroring what actionData.submittedValues might contain
// This should align with Zod schema's raw input if possible, or structure of actionData.submittedValues
export interface CreatePostFormSubmittedValues {
  name?: string;
  instagramHandle?: string;
  description?: string;
  severity?: PostSeverity | string; // string if raw from form, PostSeverity if parsed
  postAnonymously?: string | boolean; // 'on' or boolean
  adminOnly?: string | boolean; // 'on' or boolean
  // evidenceFile is not typically repopulated
}

interface UseCreatePostFormProps {
  submittedValues?: CreatePostFormSubmittedValues | null;
  // Mock data for people could be passed here if it's dynamic, or imported directly if static
  // For now, assuming mockPeople is handled outside or imported if needed by logic within the hook
  mockPeople?: Person[]; // If auto-fill logic needs it directly
}

export function useCreatePostForm({
  submittedValues,
  mockPeople = [],
}: UseCreatePostFormProps) {
  const [name, setName] = useState(submittedValues?.name || "");
  const [instagramHandle, setInstagramHandle] = useState(
    submittedValues?.instagramHandle || ""
  );
  const [description, setDescription] = useState(
    submittedValues?.description || ""
  );

  // Handle severity potentially being a string from submittedValues
  const initialSeverity =
    typeof submittedValues?.severity === "string"
      ? (submittedValues.severity as PostSeverity) // Cast if string matches enum values
      : submittedValues?.severity || PostSeverity.medium;
  const [severity, setSeverity] = useState<PostSeverity>(
    initialSeverity as PostSeverity
  );

  // Handle booleans potentially being 'on' string from submittedValues
  const initialPostAnonymously =
    typeof submittedValues?.postAnonymously === "string"
      ? submittedValues.postAnonymously === "on"
      : !!submittedValues?.postAnonymously;
  const [postAnonymously, setPostAnonymously] = useState<boolean>(
    initialPostAnonymously
  );

  const initialAdminOnly =
    typeof submittedValues?.adminOnly === "string"
      ? submittedValues.adminOnly === "on"
      : !!submittedValues?.adminOnly;
  const [adminOnly, setAdminOnly] = useState<boolean>(initialAdminOnly);

  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]); // Changed to File[]
  const [selectedNamePerson, setSelectedNamePerson] = useState<Person | null>(
    null
  );
  const [selectedInstagramPerson, setSelectedInstagramPerson] =
    useState<Person | null>(null);

  // Direct setters for simple fields are returned for flexibility,
  // but specific handlers are provided for comboboxes due to their dual state (text + selection)

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      // If text input changes to something not matching a person, clear selected person
      if (selectedNamePerson && value !== selectedNamePerson.name) {
        setSelectedNamePerson(null);
      }
    },
    [selectedNamePerson, mockPeople]
  ); // mockPeople was in dep array, but not directly used here. Removed.

  const handleInstagramChange = useCallback(
    (value: string) => {
      setInstagramHandle(value);
      if (
        selectedInstagramPerson &&
        value !== selectedInstagramPerson.instagram
      ) {
        setSelectedInstagramPerson(null);
      }
    },
    [selectedInstagramPerson, mockPeople]
  ); // mockPeople was in dep array, but not directly used here. Removed.

  const handleNameSelect = useCallback(
    (person: Person | null) => {
      setSelectedNamePerson(person);
      if (person) {
        setName(person.name);
        if (!instagramHandle || instagramHandle !== person.instagram) {
          setInstagramHandle(person.instagram);
          // Also try to update the other combobox's selection if it matches
          const matchingInstagramPerson = mockPeople.find(
            (p) => p.instagram === person.instagram && p.id === person.id
          );
          setSelectedInstagramPerson(matchingInstagramPerson || null);
        }
      } else {
        // If selection is cleared from Combobox, `value` (name) should be cleared by its own `onChange`
        // which calls `handleNameChange`. If `handleNameChange` doesn't clear `name` itself,
        // we might need `setName('')` here. But Combobox typically clears its input.
      }
    },
    [
      instagramHandle,
      mockPeople,
      setInstagramHandle,
      setSelectedInstagramPerson,
    ]
  ); // Added setInstagramHandle and setSelectedInstagramPerson

  const handleInstagramSelect = useCallback(
    (person: Person | null) => {
      setSelectedInstagramPerson(person);
      if (person) {
        setInstagramHandle(person.instagram);
        if (!name || name !== person.name) {
          setName(person.name);
          const matchingNamePerson = mockPeople.find(
            (p) => p.name === person.name && p.id === person.id
          );
          setSelectedNamePerson(matchingNamePerson || null);
        }
      }
    },
    [name, mockPeople, setName, setSelectedNamePerson]
  ); // Added setName and setSelectedNamePerson

  const resetForm = useCallback(
    (imageUploadRef?: React.RefObject<ImageUploadRef>) => {
      setName("");
      setInstagramHandle("");
      setDescription("");
      setSeverity(PostSeverity.medium);
      setEvidenceFiles([]); // Changed to empty array
      setPostAnonymously(false);
      setAdminOnly(false);
      setSelectedNamePerson(null);
      setSelectedInstagramPerson(null);
      if (imageUploadRef?.current) {
        imageUploadRef.current.clear();
      }
    },
    []
  ); // Dependencies are stable setters, no need to list them unless ESLint complains

  // Effect to re-initialize state if submittedValues change (e.g. after validation error by Remix action)
  // This ensures the form reflects the values that were submitted and caused an error,
  // allowing the user to correct them without re-typing everything.
  useEffect(() => {
    if (submittedValues) {
      setName(submittedValues.name || "");
      setInstagramHandle(submittedValues.instagramHandle || "");
      setDescription(submittedValues.description || "");

      const newSeverity =
        typeof submittedValues.severity === "string"
          ? (submittedValues.severity as PostSeverity) // Assuming string matches enum value
          : submittedValues.severity || PostSeverity.medium;
      setSeverity(newSeverity as PostSeverity); // Ensure it's PostSeverity type

      const newPostAnonymously =
        typeof submittedValues.postAnonymously === "string"
          ? submittedValues.postAnonymously === "on"
          : !!submittedValues.postAnonymously;
      setPostAnonymously(newPostAnonymously);

      const newAdminOnly =
        typeof submittedValues.adminOnly === "string"
          ? submittedValues.adminOnly === "on"
          : !!submittedValues.adminOnly;
      setAdminOnly(newAdminOnly);

      // Complex selections (selectedNamePerson, selectedInstagramPerson) are harder to repopulate
      // from simple string submittedValues. Typically, these are reset or user re-selects.
      // For now, we reset them if the corresponding text fields don't match anyone.
      const currentNameMatch = mockPeople.find(
        (p) => p.name === (submittedValues.name || "")
      );
      setSelectedNamePerson(currentNameMatch || null);

      const currentIgMatch = mockPeople.find(
        (p) => p.instagram === (submittedValues.instagramHandle || "")
      );
      setSelectedInstagramPerson(currentIgMatch || null);

      // Evidence file cannot be repopulated for security reasons.
      setEvidenceFiles([]); // Clear evidence files on new submittedValues
    }
  }, [submittedValues, mockPeople]);

  return {
    name,
    setName: handleNameChange,
    instagramHandle,
    setInstagramHandle: handleInstagramChange,
    description,
    setDescription,
    severity,
    setSeverity,
    evidenceFiles, // Changed from evidenceFile
    setEvidenceFile: setEvidenceFiles, // Changed from setEvidenceFile
    postAnonymously,
    setPostAnonymously,
    adminOnly,
    setAdminOnly,
    selectedNamePerson,
    selectedInstagramPerson,
    handleNameSelect, // For when an item is selected from Name Combobox
    handleInstagramSelect, // For when an item is selected from IG Combobox
    resetForm,
  };
}
