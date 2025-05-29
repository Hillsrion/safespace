import { create } from 'zustand';
import { PostComponentProps } from '~/lib/types';

interface PostState {
  posts: PostComponentProps[];
  setPosts: (posts: PostComponentProps[]) => void;
  removePost: (postId: string) => void;
  updatePostStatus: (postId: string, status: string) => void;
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
