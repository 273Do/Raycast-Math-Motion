import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildMessages, buildRepairMessages, EXAMPLE_BLUEPRINTS } from "@/lib/prompt";
import { validateBlueprint } from "@/schema";

describe("prompt", () => {
  for (const example of EXAMPLE_BLUEPRINTS) {
    test(`example "${example.title}" is valid`, () => {
      const result = validateBlueprint(example);
      assert.ok(result.ok && result.warnings.length === 0, JSON.stringify(result));
    });
  }

  test("repair messages carry the minified reply and the issues", () => {
    const history = buildMessages("Draw a circle");
    const messages = buildRepairMessages(history, '{\n  "a": 1\n}', [
      { code: "unknown_reference", path: "animations[0].target", message: 'Unknown object "c"' },
    ]);

    assert.deepEqual(messages.slice(0, 2), history);
    assert.deepEqual(messages[2], { role: "assistant", content: '{"a":1}' });
    assert.equal(messages[3].role, "user");
    assert.match(messages[3].content, /animations\[0\]\.target: Unknown object "c" \(unknown_reference\)/);
    assert.match(messages[3].content, /How to fix:\n- Refer only to ids/);
  });
});
