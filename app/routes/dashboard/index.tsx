import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post } from "~/generated/prisma";
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { useLoaderData } from "react-router";
import { getSession } from "~/services/session.server";
import type { ToastData } from "~/hooks/use-toast-trigger";
import { getUserById } from "~/db/repositories/users.server";
import { getAllPosts } from "~/db/repositories/posts/queries.server";

export function meta() {
  return [{ title: "Dashboard" }];
}

export const handle = {
  crumb: "Tableau de bord"
};

export async function loader({ request }: { request: Request }) {
  const user = await getCurrentUser(request);
  const session = await getSession(request);
  const toastData = session.get("toast") as ToastData | null;
  let posts: Post[] = [];
  if (!user) {
    loginRedirect(request);
    throw new Error("User not found");
  }
  const completedUser = await getUserById(user.id, {
    isSuperAdmin: true,
  });
  console.log(completedUser);
  if(!completedUser?.isSuperAdmin){
    posts = await getSpacePosts(user.id);
  } else {
    posts = await getAllPosts(user.id);
  }
  return { posts, toastData };
}



export default function Dashboard() {
  const { toastData, posts } = useLoaderData<typeof loader>();
  useToastTrigger(toastData);
  console.log(posts);
  return (
    <div>
      <SearchBar />
      <div>
        {posts.map((post: Post) => (
          <div key={post.id}>{post.description}</div>
        ))}
      </div>
    </div>
  );
}
