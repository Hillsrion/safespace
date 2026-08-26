import {
  createModerationAppealAction,
  moderationAppealsLoader,
} from "~/services/moderation-governance-actions.server";

export const loader = moderationAppealsLoader;
export const action = createModerationAppealAction;
