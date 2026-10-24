import { Action, ActionPanel, Color, Detail, Icon, Keyboard, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { generateMotion } from "@/lib/generate";
import { GenerationStage, MotionRequest, MotionResult } from "@/lib/types";
import { FORMAT_OPTIONS, QUALITY_OPTIONS, STAGE_LABELS } from "@/constants";

type Props = { request: MotionRequest };

export function Result({ request }: Props) {
  const [stage, setStage] = useState<GenerationStage>("generating-blueprint");
  const [result, setResult] = useState<MotionResult>();
  const [error, setError] = useState<Error>();
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    // Aborting also stops the renderer when the view is closed or regenerated.
    const controller = new AbortController();
    const cancelled = () => controller.signal.aborted;
    setResult(undefined);
    setError(undefined);

    generateMotion(request, (s) => !cancelled() && setStage(s), controller.signal)
      .then((r) => {
        if (cancelled()) return;
        setResult(r);
        showToast({ style: Toast.Style.Success, title: "Animation ready" });
      })
      .catch((e: Error) => {
        if (cancelled()) return;
        setError(e);
        showToast({ style: Toast.Style.Failure, title: "Generation failed", message: e.message });
      });

    return () => controller.abort();
  }, [request, runId]);

  const isLoading = !result && !error;
  const quality = QUALITY_OPTIONS.find((q) => q.value === request.quality);
  const format = FORMAT_OPTIONS.find((f) => f.value === request.format);

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle="Math Motion"
      markdown={buildMarkdown(request, stage, result, error)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={error ? "Failed" : STAGE_LABELS[stage]}
              color={error ? Color.Red : result ? Color.Green : Color.Yellow}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Quality" text={quality?.title} />
          <Detail.Metadata.Label title="Format" text={format?.title} />
          {result && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label title="Title" text={result.blueprint.title} />
              <Detail.Metadata.Label title="Length" text={`${result.blueprint.scene.duration}s`} />
              <Detail.Metadata.Label title="Elapsed" text={`${(result.durationMs / 1000).toFixed(1)}s`} />
              <Detail.Metadata.Label title="Output" text={result.outputPath} />
            </>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {result && (
            <ActionPanel.Section>
              <Action.Open title="Open Animation" target={result.outputPath} icon={Icon.Play} />
              <Action.ShowInFinder path={result.outputPath} />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section>
            {result && (
              <Action.CopyToClipboard title="Copy Blueprint" content={JSON.stringify(result.blueprint, null, 2)} />
            )}
            <Action
              title="Regenerate"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={() => setRunId((n) => n + 1)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

const buildMarkdown = (
  request: MotionRequest,
  stage: GenerationStage,
  result?: MotionResult,
  error?: Error,
): string => {
  const prompt = `## Prompt\n\n> ${request.prompt.replace(/\n/g, "\n> ")}\n\n---\n\n`;

  if (error) {
    return `${prompt}**Error:** ${error.message}`;
  }
  if (!result) {
    return `${prompt}_${STAGE_LABELS[stage]}_`;
  }

  const { blueprint, outputPath } = result;

  const preview =
    request.format === "gif"
      ? `![preview](${encodeURI(`file://${outputPath}`)})`
      : `🎬 Rendered to \`${outputPath}\` — press ↵ to open.`;
  const json = JSON.stringify(blueprint, null, 2);

  return `${prompt}\n\n## Preview\n\n${preview}\n\n## Blueprint\n\n\`\`\`json\n${json}\n\`\`\``;
};
