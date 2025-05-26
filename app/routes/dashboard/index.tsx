import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post } from "~/generated/prisma";
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { useLoaderData } from "react-router";
import { getSession } from "~/services/session.server";

export function meta() {
  return [{ title: "Dashboard" }];
}

export const handle = {
  crumb: "Tableau de bord"
};

export async function loader({ request }: { request: Request }) {
  const user = await getCurrentUser(request);
  const session = await getSession(request);
  const toastData = session.get("toast");

  if (!user) {
    loginRedirect(request);
    throw new Error("User not found");
  }
  
  const posts = await getSpacePosts(user.id);
  
  return { posts, toastData };
}



export default function Dashboard({ posts = [] }: { posts: Post[] }) {
  const { toastData } = useLoaderData<typeof loader>();
  useToastTrigger(toastData);
  return (
    <div>
      <SearchBar />
      <div>
        {posts.map((post) => (
          <div key={post.id}>{post.description}</div>
        ))}
      </div>
    </div>
  );
}
