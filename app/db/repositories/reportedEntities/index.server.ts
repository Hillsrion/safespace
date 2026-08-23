// This file exports the repository functions for ReportedEntity.

import {
  getReportedEntityById,
  getAccessibleReportedEntityById,
  getReportedEntityPosts,
} from "./queries.server";

export const reportedEntityRepository = {
  getById: getReportedEntityById,
  getAccessibleById: getAccessibleReportedEntityById,
  getPosts: getReportedEntityPosts,
};

// Optional: You could also export the functions directly if you prefer
// export { getReportedEntityById, getReportedEntityPosts };
