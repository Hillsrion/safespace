import {
  createAdminSpaceAction,
  listAdminSpacesLoader,
} from "~/services/superadmin-space-actions.server";

export const loader = listAdminSpacesLoader;
export const action = createAdminSpaceAction;
