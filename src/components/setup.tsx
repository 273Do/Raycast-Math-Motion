import { Action, ActionPanel, Color, Detail, Icon, showToast, Toast } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { useState } from "react";
import { installManim, VENV_DIR } from "@/lib/environment";
import { EnvironmentStatus } from "@/lib/types";

type Props = {
  status: EnvironmentStatus;
  isChecking: boolean;
  onRecheck: () => void;
};

export function Setup({ status, isChecking, onRecheck }: Props) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const install = async () => {
    setIsInstalling(true);
    setLog([]);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Installing Manim…" });

    try {
      await installManim((line) => {
        toast.message = line;
        setLog((prev) => [...prev.slice(-14), line]);
      });
      toast.style = Toast.Style.Success;
      toast.title = "Manim installed";
      toast.message = undefined;
      onRecheck();
    } catch (error) {
      toast.hide();
      await showFailureToast(error, { title: "Failed to install Manim" });
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Detail
      isLoading={isChecking || isInstalling}
      navigationTitle="Set Up Math Motion"
      markdown={buildMarkdown(status, isInstalling, log)}
      metadata={
        <Detail.Metadata>
          <StatusTag title="Python" value={status.python} />
          <StatusTag title="Manim" value={status.manim} />
          <StatusTag title="LaTeX" value={status.latex} optional />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Install Location" text={VENV_DIR} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {status.python && !status.manim && !isInstalling && (
            <Action title="Install Manim" icon={Icon.Download} onAction={install} />
          )}
          {!status.python && <Action.OpenInBrowser title="Download Python" url="https://www.python.org/downloads/" />}
          <Action title="Check Again" icon={Icon.ArrowClockwise} onAction={onRecheck} />
          {!status.latex && <Action.OpenInBrowser title="Install LaTeX (MacTeX)" url="https://www.tug.org/mactex/" />}
        </ActionPanel>
      }
    />
  );
}

function StatusTag({ title, value, optional }: { title: string; value?: string; optional?: boolean }) {
  const missingColor = optional ? Color.Yellow : Color.Red;
  return (
    <Detail.Metadata.TagList title={title}>
      <Detail.Metadata.TagList.Item
        text={value ?? (optional ? "Not found (optional)" : "Not found")}
        color={value ? Color.Green : missingColor}
      />
    </Detail.Metadata.TagList>
  );
}

const buildMarkdown = (status: EnvironmentStatus, isInstalling: boolean, log: string[]): string => {
  const sections = ["# Setup Required", "Math Motion needs Python and Manim to render animations."];

  if (!status.python) {
    sections.push(
      "## Python",
      "Python 3 was not found. Install it, then choose **Check Again**.",
      "```sh\nbrew install python\n```",
    );
  }

  if (status.python && !status.manim) {
    sections.push(
      "## Manim",
      "Manim will be installed into a virtual environment owned by this extension, so your global Python stays untouched.",
      "Press **↵** to install. This can take a few minutes — keep Raycast open until it finishes.",
      "If the installation fails while building `pycairo`, install the system libraries first:",
      "```sh\nbrew install cairo pkg-config\n```",
    );
  }

  if (!status.latex) {
    sections.push(
      "## LaTeX (optional)",
      "LaTeX is only required for `MathTex` / `Tex` formulas. Without it, scenes using formulas will fail to render.",
    );
  }

  if (isInstalling || log.length > 0) {
    sections.push("## Log", "```\n" + log.join("\n") + "\n```");
  }

  return sections.join("\n\n");
};
