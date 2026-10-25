import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeBlueprint } from "@/lib/normalize";
import { EXAMPLE_BLUEPRINT } from "@/lib/prompt";

describe("normalizeBlueprint", () => {
  const withDuration = (duration: number) => ({
    ...EXAMPLE_BLUEPRINT,
    scene: { ...EXAMPLE_BLUEPRINT.scene, duration },
  });

  test("extends the scene to the last animation", () => {
    const normalized = normalizeBlueprint(withDuration(5)) as typeof EXAMPLE_BLUEPRINT;
    assert.equal(normalized.scene.duration, 8);
  });

  test("keeps a scene that is already long enough", () => {
    const blueprint = withDuration(10);
    assert.equal(normalizeBlueprint(blueprint), blueprint);
  });

  test("does not extend past the limit", () => {
    const blueprint = structuredClone(EXAMPLE_BLUEPRINT);
    blueprint.animations[5].start = 40;
    assert.equal(normalizeBlueprint(blueprint), blueprint);
  });

  test("passes malformed input through", () => {
    for (const input of [null, "x", [], { scene: {} }, { scene: { duration: "5" }, animations: [] }]) {
      assert.equal(normalizeBlueprint(input), input);
    }
  });
});
