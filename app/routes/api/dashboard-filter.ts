import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/db/index.server"; // Assuming this is your Prisma client import
import { PostSeverity } from "@prisma/client"; // Using Prisma's enum for type safety
import { getCurrentUser } from "~/services/auth.server"; // For myPostsOnly/adminOnly
import type { Prisma } from "@prisma/client"; // For PostWhereInput and PostOrderByWithRelationInput

// Define a more specific type for orderBy values based on common Post fields
type OrderByField = "createdAt" | "title" | "severity" | "spaceId";


export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const q = params.get("q") || null;
  // Ensure severity is a valid PostSeverity value or null
  const severityParam = params.get("severity");
  const severity = severityParam && Object.values(PostSeverity).includes(severityParam as PostSeverity)
    ? severityParam as PostSeverity
    : null;
    
  const spaceIdsParam = params.get("spaceIds");
  const myPostsOnly = params.get("myPostsOnly") === "true";
  const adminOnly = params.get("adminOnly") === "true";

  const orderByParam = params.get("orderBy");
  const orderBy = (orderByParam && ["createdAt", "title", "severity", "spaceId"].includes(orderByParam) 
    ? orderByParam 
    : "createdAt") as OrderByField; // Default sort field
  
  const orderDirectionParam = params.get("orderDirection");
  const orderDirection = (orderDirectionParam && ["asc", "desc"].includes(orderDirectionParam) 
    ? orderDirectionParam 
    : "desc") as Prisma.SortOrder; // Default sort direction

  const groupBySpace = params.get("groupBySpace") === "true";

  const spaceIds = spaceIdsParam ? spaceIdsParam.split(",").filter(id => id.trim() !== '') : null;

  const where: Prisma.PostWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (severity) {
    where.severity = severity;
  }
  if (spaceIds && spaceIds.length > 0) {
    // Assuming 'spaceId' is the correct field name in your Post model linking to a Space.
    where.spaceId = { in: spaceIds }; 
  }

  if (myPostsOnly) {
    const currentUser = await getCurrentUser(request);
    if (currentUser && currentUser.id) { // Check currentUser and id
      // Assuming 'authorId' is the correct field name in your Post model linking to a User.
      where.authorId = currentUser.id; 
    } else {
      // If myPostsOnly is true but no user, effectively no posts should match.
      // Returning empty array is one way, or you could make a condition that's always false.
      return json([]); 
    }
  }
  
  if (adminOnly) {
    // Placeholder: Actual adminOnly logic depends on your schema.
    // This might involve checking user roles if 'adminOnly' means posts by admins,
    // or a specific flag on the Post model like 'isPinnedByAdmin'.
    // const currentUser = await getCurrentUser(request); // May need user role
    // if (currentUser && (currentUser.roles.includes('admin') || currentUser.roles.includes('superadmin'))) {
    //   // Example: where.author = { roles: { some: { name: 'admin' } } }; OR where.isSpecial = true;
    // } else {
    //    return json([]); // If adminOnly is true but user is not admin, return no posts.
    // }
    console.warn("adminOnly filter is a placeholder and not fully implemented without schema details for admin posts.");
    // For now, if adminOnly is true but no logic is defined, it might be best to return no results
    // or apply a filter that won't match anything if the user isn't identified as an admin.
    // For this exercise, we'll let it pass through and potentially be combined with other filters.
  }

  const orderByClause: Prisma.PostOrderByWithRelationInput[] = [];

  if (groupBySpace) {
    // Primary sort by spaceId if grouping. Assuming 'spaceId' is the correct field.
    orderByClause.push({ spaceId: orderDirection });
    // If a specific orderBy is provided and it's not spaceId itself, add it as secondary sort.
    if (orderBy && orderBy !== 'spaceId') {
      orderByClause.push({ [orderBy]: orderDirection });
    } else if (orderBy !== 'spaceId') { 
      // If orderBy was not specified or was 'spaceId', default to createdAt for secondary sort within group.
      orderByClause.push({ createdAt: "desc" });
    }
  } else if (orderBy) {
    // If not grouping by space, the specified orderBy is the primary sort.
    orderByClause.push({ [orderBy]: orderDirection });
  } else {
    // Default sort if nothing else is specified (neither groupBySpace nor a specific orderBy).
     orderByClause.push({ createdAt: "desc" });
  }
  
  // Ensure there's always at least one sort criterion to prevent Prisma errors if logic above is faulty
  if (orderByClause.length === 0) {
    orderByClause.push({ createdAt: "desc" });
  }
  
  // Deduplicate (e.g. if orderBy was 'spaceId' and groupBySpace was true)
  // This simple deduplication works if field names in orderBy are unique.
  // A more robust deduplication was in the example, using JSON.stringify, which is better.
  const finalOrderByClause = Array.from(new Set(orderByClause.map(s => JSON.stringify(s)))).map(s => JSON.parse(s));


  try {
    const posts = await prisma.post.findMany({
      where,
      orderBy: finalOrderByClause.length > 0 ? finalOrderByClause : undefined, // Pass undefined if empty after dedupe
      // Consider including related data if needed by the dashboard cards, e.g., author, space name
      // include: { author: true, space: true } 
    });
    return json(posts);
  } catch (error) {
    console.error("Error fetching dashboard posts:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch posts";
    return json({ error: errorMessage }, { status: 500 });
  }
}
