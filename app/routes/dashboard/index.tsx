import React, { useEffect } from 'react';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { toast } from 'sonner'; // Assuming sonner is used for toasts

import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post } from "~/generated/prisma"; // Ensure this path is correct
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { getSession, commitSession } from '~/services/session.server.ts'; // Import session utilities
// If Toaster is not in root.tsx, import it here:
// import { Toaster } from "~/components/ui/sonner";


export function meta() {
  return [{ title: "Dashboard" }];
}

export const handle = {
  crumb: "Tableau de bord"
};

export async function loader({ request }: { request: Request }) {
  const user = await getCurrentUser(request);
  if (!user) {
    loginRedirect(request);
    // After loginRedirect, which throws a redirect, this error won't be reached,
    // but as a safeguard or if loginRedirect behavior changes:
    throw new Error("User not found and redirect failed."); 
  } 
  
  const session = await getSession(request.headers.get("Cookie"));
  const toastMessage = session.get("toastMessage") || null;
  // Note: getSpacePosts might need spaceId or other params depending on its full definition.
  // Assuming it works with just userId for now, or fetches for all user's spaces.
  const posts = await getSpacePosts(user.id); 

  return json(
    { posts, toastMessage, user }, // Include user if needed by the component
    {
      headers: {
        "Set-Cookie": await commitSession(session), // Commit session to clear flash message
      },
    }
  );
}

// Define a more specific type for loader data if possible
interface DashboardLoaderData {
  posts: Post[];
  toastMessage: string | null;
  user: { id: string; /* other user fields if returned by getCurrentUser */ }; // Adjust based on actual user type
}

export default function Dashboard() {
  const { posts = [], toastMessage, user } = useLoaderData<DashboardLoaderData>();

  useEffect(() => {
    if (toastMessage) {
      toast.success(toastMessage);
    }
  }, [toastMessage]);

  return (
    <div>
      {/* If Toaster is not globally available, add it here: <Toaster /> */}
      <SearchBar />
      <div className="mt-4">
        <h2 className="text-xl font-semibold mb-2">Posts for {user?.id?.substring(0,8)}... </h2> {/* Example usage of user data */}
        {posts.length === 0 && <p>No posts found.</p>}
        {posts.map((post) => (
          <div key={post.id} className="p-2 border-b">
            <p className="font-semibold">{post.id.substring(0,8)}...</p>
            <p>{post.description}</p>
            {/* Add more post details as needed */}
          </div>
        ))}
      </div>
    </div>
  );
}
