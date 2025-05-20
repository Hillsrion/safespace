import { useMatches, type UIMatch } from "react-router";

type RouteDataWithMeta = {
  [key: string]: unknown;
};

type RouteMatch = UIMatch<RouteDataWithMeta, unknown>;

export function useMeta(): {
  title: string;
} {
  const meta = useMatches() as RouteMatch[];

  return {
    title: String(meta.find((match) => match.data?.title)) ?? "SafeSpace",
  };
}
