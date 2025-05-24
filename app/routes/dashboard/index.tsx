import { json } from "@remix-run/node"; // Ensure json is imported
import { useLoaderData } from "@remix-run/react";
import { SearchBar } from "~/components/search-bar";
import { SearchFilters } from "~/components/search-filters";
import { useSearchFilters } from "~/hooks/useSearchFilters";
import type { Post } from "~/generated/prisma"; // Or from "@prisma/client"
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import type { Space } from "~/lib/types";
import { PostSeverity } from "@prisma/client"; // For availableSeverities
import { loginRedirect } from "~/lib/redirects"; // Keep for loader

export function meta() {
  return [{ title: "Dashboard" }];
}

export const handle = {
  crumb: "Tableau de bord"
};

export async function loader({ request }: { request: Request }) {
  const user = await getCurrentUser(request);
  if (!user) {
    loginRedirect(request); // Ensure redirect is handled
    // Throwing an error or returning a redirect response is also an option
    // For example: throw redirect("/login");
    // For now, keeping it as is, but a redirect response is often better.
    throw new Error("User not found and redirect failed."); 
  }
  // Assuming getSpacePosts might not be relevant anymore if useSearchFilters fetches all its data
  // Or it could be used for an initial, unfiltered list if desired.
  // For now, we'll fetch it as `initialPosts` as per example, though not directly rendered.
  const posts = await getSpacePosts(user.id); 
  return json({ posts, user }); // Return user and initial posts
}

export default function Dashboard() {
  // initialPosts is available if needed for comparison or seeding, but filteredPosts drives display
  const { posts: _initialPosts, user } = useLoaderData<typeof loader>(); 
  
  const { 
    results: filteredPosts, 
    loading: isLoadingFilters,
    // other states from useSearchFilters can be destructured if needed here
  } = useSearchFilters({
    // We are not passing initial filter state from URL params to the hook here,
    // but that could be an enhancement (e.g. reading URL query params and passing to useSearchFilters)
  });

  const availableSpaces: Space[] = [
    { id: "1", name: "Space Alpha" },
    { id: "2", name: "Space Beta" },
    { id: "3", name: "Project Gamma" },
  ];
  // Adapt user.roles access based on your actual User model structure from Prisma
  // Assuming user.roles is an array of strings like ['user', 'admin']
  // If user.role is a single string, it would be: const userRoles = user?.role ? [user.role] : ["user"];
  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.roles ? [String(user.roles)] : ["user"]); 
  const availableSeverities = Object.values(PostSeverity);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <SearchBar /> {/* Global search bar reinstated */}
      </header>
      
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={userRoles}
        availableSeverities={availableSeverities}
      />

      <div>
        {isLoadingFilters ? (
          <p>Loading posts...</p>
        ) : filteredPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPosts.map((post: Post) => ( // Ensure post is typed
              <div key={post.id} className="p-4 border rounded-lg shadow-sm">
                <h3 className="text-lg font-semibold mb-1">{post.title || "Untitled Post"}</h3>
                <p className="text-sm text-gray-600 mb-2 line-clamp-3">{post.description || "No description."}</p>
                {post.severity && (
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    post.severity === PostSeverity.High ? 'bg-red-100 text-red-800' :
                    post.severity === PostSeverity.Medium ? 'bg-yellow-100 text-yellow-800' :
                    post.severity === PostSeverity.Low ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800' // For None or other severities
                  }`}>
                    {post.severity}
                  </span>
                )}
                 {/* Add more post details as needed, e.g., space, author, date */}
              </div>
            ))}
          </div>
        ) : (
          <p>No posts found matching your filters.</p>
        )}
      </div>
    </div>
  );
}
