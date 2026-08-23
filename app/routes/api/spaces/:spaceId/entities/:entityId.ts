import {
  getReportedEntityLoader,
  mutateReportedEntityAction,
} from "~/services/reported-entity-admin-actions.server";

export const loader = getReportedEntityLoader;
export const action = mutateReportedEntityAction;
