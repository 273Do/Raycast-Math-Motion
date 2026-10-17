import { Detail } from "@raycast/api";
import { CreateForm } from "./components/form";
import { Setup } from "./components/setup";
import { useEnvironment } from "./hooks/use-environment";

export default function Command() {
  const { status, isLoading, isReady, revalidate } = useEnvironment();

  if (!status) {
    return <Detail isLoading markdown="Checking environment…" />;
  }
  if (!isReady) {
    return <Setup status={status} isChecking={isLoading} onRecheck={revalidate} />;
  }
  return <CreateForm />;
}
