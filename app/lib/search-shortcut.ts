type KeyboardShortcut = Pick<KeyboardEvent, "ctrlKey" | "key" | "metaKey">;

export function isSearchShortcut(event: KeyboardShortcut): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}
