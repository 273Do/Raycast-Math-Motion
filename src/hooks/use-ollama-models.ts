import { getPreferenceValues } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { listModels } from "@/lib/ollama";

export const useOllamaModels = () => {
  const { ollamaUrl } = getPreferenceValues<Preferences>();
  const { data, error, isLoading, revalidate } = usePromise(listModels, [ollamaUrl], {
    // The form shows the error instead of a toast.
    onError: () => {},
  });

  return { models: data, error, isLoading, revalidate };
};
