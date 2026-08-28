import { adminAnnouncementsLoader, createAnnouncementAction } from "~/services/system-announcements-actions.server";
export const loader = adminAnnouncementsLoader;
export const action = createAnnouncementAction;
