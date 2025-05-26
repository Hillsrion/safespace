import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post } from "~/generated/prisma";
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";

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
    throw new Error("User not found");
  }
  
  const posts = await getSpacePosts(user.id);
  
  return { posts };
}



export default function Dashboard({ posts = [] }: { posts: Post[] }) {
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
