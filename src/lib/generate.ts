import path from "node:path";
import { ENV, findLatex, OUTPUT_DIR, RENDER_SCRIPT, VENV_PYTHON } from "@/lib/environment";
import { PLACEHOLDER_BLUEPRINT } from "@/lib/placeholder-blueprint";
import { renderBlueprint } from "@/lib/render";
import { GenerationStage, MotionRequest, MotionResult } from "@/lib/types";
import { Blueprint, BlueprintIssue, validateBlueprint } from "@/schema";

export const generateMotion = async (
  request: MotionRequest,
  onStage: (stage: GenerationStage) => void,
  signal?: AbortSignal,
): Promise<MotionResult> => {
  const startedAt = Date.now();

  onStage("generating-blueprint");
  const blueprint = await generateBlueprint();

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

// TODO: Generate the blueprint from the request with an LLM.
const generateBlueprint = async (): Promise<Blueprint> => {
  const result = validateBlueprint(PLACEHOLDER_BLUEPRINT);
  if (!result.ok) {
    throw new Error(`The generated blueprint is invalid:\n\n${formatIssues(result.errors)}`);
  }
  return result.blueprint;
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
