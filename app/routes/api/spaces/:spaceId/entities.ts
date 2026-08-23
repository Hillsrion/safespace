import {
  createReportedEntityAction,
  listReportedEntitiesLoader,
} from "~/services/reported-entity-admin-actions.server";

export const loader = listReportedEntitiesLoader;
export const action = createReportedEntityAction;
