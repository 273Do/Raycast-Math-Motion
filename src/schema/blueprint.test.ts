import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { parseExpression } from "@/schema/expression";
import { checkLatex } from "@/schema/latex";
import { validateBlueprintJson } from "@/schema";
import { renderBlueprintJsonSchema, OUTPUT_PATH } from "../../scripts/generate-blueprint-schema";

type Expectation = { valid: true } | { valid: false; code: string; path?: string };

const FIXTURES_DIR = path.join(__dirname, "..", "..", "tests", "renderer-fixtures");
const expectations: Record<string, Expectation> = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, "expectations.json"), "utf8"),
);

describe("renderer fixtures", () => {
  test("every fixture has an expectation", () => {
    const fixtures = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json") && f !== "expectations.json");
    assert.deepEqual(fixtures.sort(), Object.keys(expectations).sort());
  });

  for (const [file, expected] of Object.entries(expectations)) {
    test(file, () => {
      const result = validateBlueprintJson(fs.readFileSync(path.join(FIXTURES_DIR, file), "utf8"));

      if (expected.valid) {
        assert.ok(result.ok, JSON.stringify(!result.ok && result.errors, null, 2));
        assert.deepEqual(result.warnings, []);
        return;
      }

      assert.ok(!result.ok, "expected the blueprint to be rejected");
      assert.deepEqual(
        result.errors.map((e) => e.code),
        [expected.code],
        JSON.stringify(result.errors, null, 2),
      );
      if (expected.path !== undefined) assert.equal(result.errors[0].path, expected.path);
    });
  }
});

test("schema/blueprint.schema.json is up to date (run `npm run generate:schema`)", () => {
  assert.equal(fs.readFileSync(OUTPUT_PATH, "utf8"), renderBlueprintJsonSchema());
});

describe("expression grammar", () => {
  const context = { parameters: new Set(["n"]) };

  for (const source of [
    "sin(x)",
    "x^2 / 2 - 3 * x + 1",
    "-x^2",
    "exp(-x^2) * cos(2 * pi * x)",
    "sum(k, 1, n, x^k / k)",
  ]) {
    test(`accepts ${source}`, () => {
      assert.doesNotThrow(() => parseExpression(source, context));
    });
  }

  for (const source of [
    "__import__('os')",
    "2x",
    "y + 1",
    "eval(x)",
    "sin x",
    "x.real",
    "sum(x, 1, 3, x)",
    "sum(k, 1, 2.5, k)",
    "k + 1",
    "(x",
    "",
  ]) {
    test(`rejects ${JSON.stringify(source)}`, () => {
      assert.throws(() => parseExpression(source, context));
    });
  }
});

describe("latex allowlist", () => {
  for (const source of [
    "e^{i\\pi} + 1 = 0",
    "\\frac{a}{b}",
    "\\left( x \\right)",
    "\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}",
    "a\\,b",
  ]) {
    test(`accepts ${source}`, () => {
      assert.equal(checkLatex(source), undefined);
    });
  }

  for (const source of [
    "\\input{/etc/passwd}",
    "\\include{x}",
    "\\write18{ls}",
    "\\def\\x{1}",
    "\\csname input\\endcsname",
    "^^5cinput{/etc/passwd}",
    "\\begin{verbatim}x\\end{verbatim}",
    "x = 日本語",
  ]) {
    test(`rejects ${JSON.stringify(source)}`, () => {
      assert.notEqual(checkLatex(source), undefined);
    });
  }
});
