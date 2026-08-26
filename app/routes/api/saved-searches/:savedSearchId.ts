import {
  mutateSavedSearchAction,
  savedSearchLoader,
} from "~/services/saved-search-actions.server";

export const loader = savedSearchLoader;
export const action = mutateSavedSearchAction;
