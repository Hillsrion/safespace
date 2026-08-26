import {
  createSavedSearchAction,
  savedSearchesLoader,
} from "~/services/saved-search-actions.server";

export const loader = savedSearchesLoader;
export const action = createSavedSearchAction;
