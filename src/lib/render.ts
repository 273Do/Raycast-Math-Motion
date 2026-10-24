import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Quality } from "@/lib/types";
import { Blueprint } from "@/schema";

/** Runs `assets/renderer/render.py`. Kept free of `@raycast/api` so it can be tested with plain Node. */

export type RenderOptions = {
  python: string;
  script: string;
  outputPath: string;
  quality: Quality;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export class RenderError extends Error {
  constructor(
    message: string,
    /** True when the renderer rejected the blueprint rather than failing to render it. */
    readonly rejected: boolean,
  ) {
    super(message);
    this.name = "RenderError";
  }
}

type RenderResponse = { ok: true; output: string } | { ok: false; error: string };

// Exit codes of render.py.
const EXIT_REJECTED = 2;

export const renderBlueprint = async (blueprint: Blueprint, options: RenderOptions): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "math-motion-"));
  const blueprintPath = path.join(dir, "blueprint.json");

  try {
    await fs.writeFile(blueprintPath, JSON.stringify(blueprint));
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });

    const { code, stdout, stderr } = await run(
      options.python,
      [options.script, blueprintPath, "--output", options.outputPath, "--quality", options.quality],
      // Keep Python from writing __pycache__ into the extension bundle.
      { ...(options.env ?? process.env), PYTHONDONTWRITEBYTECODE: "1" },
      options.signal,
    );

    const response = parseResponse(stdout);
    if (!response) {
      const detail = stderr.trim().split("\n").slice(-10).join("\n");
      throw new RenderError(`Renderer exited with code ${code} without a result\n\n${detail}`, false);
    }
    if (!response.ok) {
      throw new RenderError(response.error, code === EXIT_REJECTED);
    }
    return response.output;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

/** The renderer reports its result as the last line of stdout. */
const parseResponse = (stdout: string): RenderResponse | undefined => {
  const last = stdout.trim().split("\n").pop();
  if (!last) return undefined;
  try {
    return JSON.parse(last) as RenderResponse;
  } catch {
    return undefined;
  }
};

const run = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, signal });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
};
