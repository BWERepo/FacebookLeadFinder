import { useState } from "react";

const STORAGE_KEY = "flf:lastCategory";

function readStored(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies) —
    // falling back to "Any category" is fine, this is a convenience only.
    return "";
  }
}

/**
 * The category picker's last-used selection, remembered across sessions (via
 * localStorage) so a new search starts from whichever categories were picked
 * last time instead of always resetting to "Any category". Shared by all
 * three search-mode forms so picking a category in one carries over to the
 * others.
 */
export function useRememberedCategory(): [string, (value: string) => void] {
  const [category, setCategoryState] = useState<string>(readStored);

  function setCategory(value: string) {
    setCategoryState(value);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // See readStored — remembering the category is a convenience, not
      // something worth failing the form over.
    }
  }

  return [category, setCategory];
}
