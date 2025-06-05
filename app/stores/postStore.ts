import { create } from "zustand";
import type { TPost } from "~/lib/types";

interface PostState {
  posts: TPost[];
  setPosts: (posts: TPost[]) => void;
  removePost: (postId: string) => void;
  updatePostStatus: (postId: string, status: TPost["status"]) => void;
}

export const usePostStore = create<PostState>((set) => ({
  posts: [],
  setPosts: (posts) => set({ posts }),
  removePost: (postId) =>
    set((state) => ({
      posts: state.posts.filter((post) => post.id !== postId),
    })),
  updatePostStatus: (postId, status) =>
    set((state) => ({
      posts: state.posts.map((post) =>
        post.id === postId ? { ...post, status } : post
      ),
    })),
}));
