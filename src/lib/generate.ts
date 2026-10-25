import { getPreferenceValues } from "@raycast/api";
import path from "node:path";
import { ENV, findLatex, OUTPUT_DIR, RENDER_SCRIPT, VENV_PYTHON } from "@/lib/environment";
import { normalizeBlueprint } from "@/lib/normalize";
import { chat, toOllamaFormat } from "@/lib/ollama";
import { buildMessages, buildRepairMessages } from "@/lib/prompt";
import { renderBlueprint } from "@/lib/render";
import { GenerationStage, MotionRequest, MotionResult } from "@/lib/types";
import { Blueprint, BlueprintIssue, toBlueprintJsonSchema, validateBlueprint, validateBlueprintJson } from "@/schema";

// Times the model may retry after returning an invalid blueprint.
const MAX_REPAIRS = 2;

export const generateMotion = async (
  request: MotionRequest,
  onStage: (stage: GenerationStage) => void,
  signal?: AbortSignal,
): Promise<MotionResult> => {
  const startedAt = Date.now();

  onStage("generating-blueprint");
  const blueprint = await generateBlueprint(request, onStage, signal);

  onStage("rendering");
  if (blueprint.objects.some((object) => object.type === "math") && !(await findLatex())) {
    throw new Error("This animation contains math formulas, which need LaTeX. Install LaTeX and try again.");
  }
  const outputPath = await renderBlueprint(blueprint, {
    python: VENV_PYTHON,
    script: RENDER_SCRIPT,
    outputPath: path.join(OUTPUT_DIR, `math-motion-${timestamp()}.${request.format}`),
    quality: request.quality,
    env: ENV,
    signal,
  });

  onStage("done");

  return { blueprint, outputPath, durationMs: Date.now() - startedAt };
};

const generateBlueprint = async (
  { prompt, model }: MotionRequest,
  onStage: (stage: GenerationStage) => void,
  signal?: AbortSignal,
): Promise<Blueprint> => {
  const { ollamaUrl } = getPreferenceValues<Preferences>();
  const format = toOllamaFormat(toBlueprintJsonSchema()) as object;
  let messages = buildMessages(prompt);

  for (let attempt = 0; ; attempt++) {
    const reply = await chat({ baseUrl: ollamaUrl, model, messages, format, temperature: 0.2, signal });
    const result = validateReply(reply);
    if (result.ok) return result.blueprint;

    if (attempt >= MAX_REPAIRS) {
      throw new Error(`The generated blueprint is invalid:\n\n${formatIssues(result.errors)}`);
    }
    onStage("repairing-blueprint");
    messages = buildRepairMessages(messages, reply, result.errors);
  }
};

const validateReply = (reply: string) => {
  let input: unknown;
  try {
    input = JSON.parse(reply);
  } catch {
    // Reports the parse error as an issue.
    return validateBlueprintJson(reply);
  }
  return validateBlueprint(normalizeBlueprint(input));
};

const formatIssues = (issues: BlueprintIssue[]): string => {
  return issues.map((issue) => `- \`${issue.path || "<root>"}\` ${issue.message} (${issue.code})`).join("\n");
};

/** File-name-safe local time, e.g. 2026-10-24_19-30-05. */
const timestamp = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
};
