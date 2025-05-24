import type { LoaderFunctionArgs } from "@remix-run/node";
import { json as data } from "@remix-run/node"; // Use json as data for consistency if it was used, or just json
import { prisma } from "~/db/client.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q) {
    // Return empty array or an error/empty results indicator if no query
    return data([]); 
    // Or, if it previously returned an error object:
    // return data({ ok: false, error: "No query provided" }, { status: 400 });
  }

  try {
    const posts = await prisma.post.findMany({
      where: {
        // Assuming original search was on description or title
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        reportedEntity: true, // This include was present in later versions, might have been simpler before
                               // For a true revert, this might be removed if not essential for global search display
      },
      // Original might not have had explicit orderBy or a very simple one
      orderBy: { 
        createdAt: 'desc' 
      }
    });

    const reportedEntities = await prisma.reportedEntity.findMany({
      where: {
        name: {
          contains: q,
          mode: "insensitive",
        },
      },
      include: {
        handles: true,
      },
    });

    const reportedEntityHandles = await prisma.reportedEntityHandle.findMany({
      where: {
        handle: {
          contains: q,
          mode: "insensitive",
        },
      },
      include: {
        reportedEntity: {
          include: {
            handles: true,
          },
        },
      },
    });

    // User search was removed later, so it should not be in this reverted version.

    const results = [
      ...posts.map((post) => ({ type: "post", data: post })),
      ...reportedEntities.map((entity) => ({
        type: "reportedEntity",
        data: entity,
      })),
      ...reportedEntityHandles.map((handle) => ({
        type: "reportedEntity",
        data: handle.reportedEntity,
      })),
    ];

    // Deduplicate results based on type and ID
    const uniqueResultsMap = new Map();
    results.forEach((item) => {
      const key = `${item.type}-${item.data.id}`;
      if (!uniqueResultsMap.has(key)) {
        uniqueResultsMap.set(key, item);
      }
    });
    const uniqueResults = Array.from(uniqueResultsMap.values());

    return data(uniqueResults);

  } catch (error) {
    console.error("Search error:", error);
    // Ensure error response is JSON serializable
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return data(
      { 
        ok: false, 
        error: process.env.NODE_ENV === "production" ? "Search failed" : errorMessage 
      }, 
      { status: 500 }
    );
  }
}
