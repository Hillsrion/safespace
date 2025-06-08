import { create } from "zustand";
import type { TPost } from "~/lib/types";

interface PostState {
  posts: TPost[];
  nextCursor: string | null;
  hasNextPage: boolean;
  isLoadingMore: boolean;
  setPosts: (posts: TPost[], nextCursor?: string | null, hasNextPage?: boolean) => void;
  addPosts: (posts: TPost[], nextCursor?: string | null, hasNextPage?: boolean) => void;
  removePost: (postId: string) => void;
  updatePostStatus: (postId: string, status: TPost["status"]) => void;
  setIsLoadingMore: (loading: boolean) => void;
}

export const usePostStore = create<PostState>((set) => ({
  posts: [],
  nextCursor: null,
  hasNextPage: false,
  isLoadingMore: false,

  setPosts: (posts, nextCursor = null, hasNextPage = false) =>
    set({
      posts,
      nextCursor,
      hasNextPage,
      isLoadingMore: false,
    }),

  addPosts: (newPosts, nextCursor = null, hasNextPage = false) =>
    set((state) => ({
      posts: [...state.posts, ...newPosts],
      nextCursor,
      hasNextPage,
      isLoadingMore: false,
    })),

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

  setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),
}));
