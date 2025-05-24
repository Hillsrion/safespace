import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/db/client.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q) {
    return json([]);
  }

  try {
    const posts = await prisma.post.findMany({
      where: {
        description: {
          contains: q,
          mode: "insensitive",
        },
      },
      include: {
        reportedEntity: true,
      },
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
            handles: true, // Also include other handles of the parent entity
          }
        } 
      }
    });

    // User search removed as per requirements

    const results = [
      ...posts.map((post) => ({ type: "post", data: post })),
      ...reportedEntities.map((entity) => ({
        type: "reportedEntity",
        data: entity,
      })),
      // Map handle search results to their parent ReportedEntity
      // This avoids duplicate ReportedEntity entries if found by both name and handle
      ...reportedEntityHandles.map((handle) => ({
        type: "reportedEntity", // Change type to "reportedEntity"
        data: handle.reportedEntity, // Return the parent entity
      })),
      // User results mapping removed
    ];
    
    // Deduplicate results based on type and ID
    const uniqueResults = Array.from(new Map(results.map(item => [`${item.type}-${item.data.id}`, item])).values());

    return json(uniqueResults);
  } catch (error) {
    console.error("Search error:", error);
    return json({ error: "Search failed" }, { status: 500 });
  }
}
