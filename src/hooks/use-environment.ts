import { useCachedPromise } from "@raycast/utils";
import { checkEnvironment } from "../lib/environment";

export const useEnvironment = () => {
  const { data, isLoading, revalidate } = useCachedPromise(checkEnvironment, [], { keepPreviousData: true });

  return {
    status: data,
    isLoading,
    isReady: Boolean(data?.python && data?.manim),
    revalidate,
  };
};
