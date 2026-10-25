import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { EXAMPLE_BLUEPRINT } from "@/lib/prompt";
import { renderBlueprint, RenderError } from "@/lib/render";
import { Blueprint } from "@/schema";

// The venv the extension's setup screen installs Manim into, or MANIM_PYTHON.
const PYTHON =
  process.env.MANIM_PYTHON ??
  path.join(os.homedir(), "Library/Application Support/com.raycast.macos/extensions/math-motion/venv/bin/python");
const SCRIPT = path.join(__dirname, "..", "..", "assets", "renderer", "render.py");
const OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "math-motion-render-test-"));
const skip = fs.existsSync(PYTHON) ? false : `Manim Python not found at ${PYTHON}; set MANIM_PYTHON`;

after(() => fs.rmSync(OUTPUT_DIR, { recursive: true, force: true }));

const options = (name: string, signal?: AbortSignal) => ({
  python: PYTHON,
  script: SCRIPT,
  outputPath: path.join(OUTPUT_DIR, name),
  quality: "low" as const,
  signal,
});

describe("renderBlueprint", { skip }, () => {
  test("renders an mp4", async () => {
    const output = await renderBlueprint(EXAMPLE_BLUEPRINT, options("example.mp4"));
    assert.equal(output, fs.realpathSync(path.join(OUTPUT_DIR, "example.mp4")));
    assert.ok(fs.statSync(output).size > 0);
  });

  test("renders a gif", async () => {
    const output = await renderBlueprint(EXAMPLE_BLUEPRINT, options("example.gif"));
    assert.equal(fs.readFileSync(output).subarray(0, 6).toString(), "GIF89a");
  });

  test("reports a rejected blueprint", async () => {
    const blueprint = structuredClone(EXAMPLE_BLUEPRINT);
    (blueprint.animations[0] as { action: string }).action = "explode";

    await assert.rejects(renderBlueprint(blueprint as Blueprint, options("rejected.mp4")), (error) => {
      assert.ok(error instanceof RenderError);
      assert.equal(error.rejected, true);
      assert.match(error.message, /explode/);
      return true;
    });
  });

  test("stops the renderer when aborted", async () => {
    const controller = new AbortController();
    const rendering = renderBlueprint(EXAMPLE_BLUEPRINT, options("aborted.mp4", controller.signal));
    setTimeout(() => controller.abort(), 100);

    await assert.rejects(rendering, { name: "AbortError" });
    assert.ok(!fs.existsSync(path.join(OUTPUT_DIR, "aborted.mp4")));
  });
});
