// This file exports the repository functions for ReportedEntity.

import {
  getReportedEntityById,
  getReportedEntityPosts,
} from "./queries.server";

export const reportedEntityRepository = {
  getById: getReportedEntityById,
  getPosts: getReportedEntityPosts,
};

// Optional: You could also export the functions directly if you prefer
// export { getReportedEntityById, getReportedEntityPosts };
