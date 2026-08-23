import {
  getAdminSpaceLoader,
  mutateAdminSpaceAction,
} from "~/services/superadmin-space-actions.server";

export const loader = getAdminSpaceLoader;
export const action = mutateAdminSpaceAction;
