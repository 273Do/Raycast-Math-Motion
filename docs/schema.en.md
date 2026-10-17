# Blueprint Schema (`src/schema/`)

`src/schema/` decides whether an Animation Blueprint is valid. A Blueprint is the JSON the LLM produces to describe a scene. It is the contract between the LLM, the TypeScript extension, and the Python renderer: only a Blueprint that passes this validation reaches the renderer.

## Validation flow

```text
JSON text
  │  validateBlueprintJson()      JSON.parse            → invalid_json
  ▼
unknown value
  │  validateBlueprint()
  │    1. BlueprintSchema (Zod)   structure and ranges  → schema_error, unknown_field, out_of_range, …
  │    2. checkRules()            cross-field rules     → unknown_reference, target_overlap, …
  ▼
{ ok: true, blueprint, warnings } | { ok: false, errors, warnings }
```

- If step 1 fails, step 2 does not run, so the rules can trust that the types are correct.
- Inside step 2, timing and lifecycle checks run only after every reference resolves.
- Errors are collected rather than thrown, so one run reports every problem it finds.

## Files

| File                | Role                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `blueprint.ts`      | Zod definition of the structure, field types, required fields, and value ranges (`LIMITS`). Source of the generated JSON Schema. |
| `rules.ts`          | Cross-field rules that JSON Schema cannot express (`checkRules`).                                                                |
| `expression.ts`     | Parser for graph expressions. Accepts only an allowlisted grammar and never evaluates the expression.                            |
| `latex.ts`          | Allowlist of LaTeX commands and environments for `math` objects.                                                                 |
| `issues.ts`         | Issue type and the list of issue codes.                                                                                          |
| `validate.ts`       | Entry point. Runs JSON parsing → Zod → rules and maps Zod issues to issue codes.                                                 |
| `index.ts`          | Public API. Import from `@/schema`.                                                                                              |
| `blueprint.test.ts` | Tests against the fixtures, the expression grammar, and the LaTeX allowlist.                                                     |

Related files outside the directory:

| Path                                   | Role                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema/blueprint.schema.json`         | JSON Schema generated from `blueprint.ts`. Used as Ollama's `format` and by the Python renderer's `jsonschema` check. Do not edit by hand. |
| `scripts/generate-blueprint-schema.ts` | Writes the file above (`npm run generate:schema`).                                                                                         |
| `tests/renderer-fixtures/`             | Hand-written Blueprints and `expectations.json`, which lists the expected result for each one.                                             |

## Usage

```ts
import { validateBlueprintJson } from "@/schema";

const result = validateBlueprintJson(text);
if (!result.ok) {
  for (const issue of result.errors) console.log(issue.code, issue.path, issue.message);
} else {
  render(result.blueprint); // typed as Blueprint
}
```

Each issue has a `code`, a `path` such as `animations[1].target`, and a human-readable `message`.

## Blueprint structure

```jsonc
{
  "version": "1.0",
  "title": "…",
  "scene": { "width": 1280, "height": 720, "fps": 30, "background": "#101014", "duration": 12 },
  "objects": [/* visual objects and parameters */],
  "animations": [/* { target, action, start, duration, params } */],
}
```

Every object is a strict object, so any unknown field is rejected.

### Objects

Visual objects share `id`, `type`, `position`, `style` (`color`, `opacity`, `scale`), and `data`.

| `type`           | `data`                                              |
| ---------------- | --------------------------------------------------- |
| `text`           | `text`, `fontSize`                                  |
| `math`           | `latex`, `fontSize`                                 |
| `axes`           | `xRange`, `yRange`                                  |
| `graph`          | `expression`, `xRange`, `axesId`                    |
| `circle`         | `radius` (≤ 4)                                      |
| `dot`            | `radius` (≤ 0.5)                                    |
| `rectangle`      | `width`, `height`                                   |
| `line` / `arrow` | `start`, `end`                                      |
| `polygon`        | `points` (3–20)                                     |
| `parameter`      | `initial`, `integer` (has no `position` or `style`) |

### Animations

Every animation has `target`, `action`, `start`, `duration`, and `params`. `params` depends on the action:

| `action`                                             | `params`            |
| ---------------------------------------------------- | ------------------- |
| `create`, `write`, `fade_in`, `fade_out`, `indicate` | `{}`                |
| `move`                                               | `to: [x, y]`        |
| `rotate`                                             | `angle` (degrees)   |
| `scale`                                              | `factor`            |
| `transform`                                          | `into: <object id>` |
| `animate_parameter`                                  | `to`                |

### Conventions

- **Units:** coordinates are Manim scene units, not pixels. The visible frame is about x ±7.1, y ±4.
- **`position`:** the center of the object. Geometry in `data` (`start`, `end`, `points`) is relative to it.
- **Angles:** degrees.
- **Time:** seconds. Each animation occupies the half-open interval `[start, start + duration)`.
- **Integer parameters:** when `integer` is true, the value is read as `floor(value + 0.5)`.

## Limits (`LIMITS`)

| Item                                   | Range                      |
| -------------------------------------- | -------------------------- |
| `scene.width` / `scene.height`         | 320–1920 / 240–1080        |
| `scene.fps`                            | 15–60                      |
| `scene.duration`, `start`, `duration`  | up to 30 s                 |
| Objects / animations                   | up to 30 / 60              |
| Coordinates                            | x ±8, y ±4.5               |
| `style.scale`, `scale.factor`          | > 0 and ≤ 5                |
| `style.opacity`                        | 0–1                        |
| `fontSize`                             | 8–144                      |
| `text` / `latex` / `expression` length | 200 / 300 / 300 characters |
| Axis range values, `parameter` values  | ±100                       |
| Terms in one `sum()`                   | 100                        |

## Cross-field rules (`rules.ts`)

| Rule                                                                                                                                                                                    | Code                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Object ids are unique.                                                                                                                                                                  | `duplicate_id`        |
| Every range has min < max (`axes.xRange` / `yRange`, `graph.xRange`).                                                                                                                   | `out_of_range`        |
| `animations[].target`, `graph.data.axesId`, and `transform.params.into` refer to existing objects.                                                                                      | `unknown_reference`   |
| References point to the right kind of object: `axesId` must be an `axes`; only `animate_parameter` may target a `parameter`; `transform` cannot turn into a `parameter` or into itself. | `invalid_reference`   |
| Every animation ends within `scene.duration`.                                                                                                                                           | `exceeds_duration`    |
| One object never runs two animations at once. Animations that only touch (one ends exactly when the next starts) are allowed. A `transform` also occupies its `into` object.            | `target_overlap`      |
| Objects follow their lifecycle (see below).                                                                                                                                             | `lifecycle_violation` |
| Graph expressions follow the grammar, and each `sum()` stays within the term limit.                                                                                                     | `invalid_expression`  |
| LaTeX uses only allowlisted commands and environments.                                                                                                                                  | `forbidden_latex`     |
| A visual object that never appears produces a warning, not an error.                                                                                                                    | `never_appears`       |

### Lifecycle

Each visual object moves through `pending → visible → gone`:

- `create`, `write`, and `fade_in` are entrance actions. They are allowed only in `pending`.
- Every other action requires `visible`.
- `fade_out` moves the target to `gone`.
- `transform` moves the target to `gone` and its `into` object from `pending` to `visible`, as Manim's `ReplacementTransform` does. The `into` object must not have appeared before.
- An object cannot re-enter after it is `gone`. `ReplacementTransform` reshapes the source object, so bringing it back would not show the original shape.
- `parameter` objects are always available and need no entrance action.

## Graph expressions (`expression.ts`)

```text
expr    := term (("+" | "-") term)*
term    := unary (("*" | "/") unary)*
unary   := ("+" | "-") unary | power
power   := primary ("^" unary)?
primary := number | identifier | call | "(" expr ")"
call    := function "(" expr ")" | "sum(" identifier "," bound "," bound "," expr ")"
bound   := integer | parameter id
```

- **Identifiers:** the variable `x`, the constants `pi` and `e`, parameter ids, and a `sum()` index inside its own body.
- **Functions:** `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `exp`, `log`, `sqrt`, `abs`, `floor`, `ceil`.
- **`sum(k, from, to, body)`:** a finite sum. Each bound must be an integer literal or a parameter id. The term count is checked against the largest value the parameter takes during the scene, which is the maximum of its `initial` and every `animate_parameter.to`.
- **Not supported:** implicit multiplication. Write `2 * x`, not `2x`.

The parser only builds an AST. It never passes the expression to `eval()`. The renderer evaluates the same AST.

## LaTeX (`latex.ts`)

- Only commands in `LATEX_COMMANDS` are allowed. These are Greek letters, fractions and roots, big operators, common functions, relations, arrows, and symbols.
- Only the environments `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `cases`, and `aligned` are allowed.
- Single-character escapes for spacing and literals (`\,` `\;` `\:` `\!` `\ ` `\{` `\}` `\|` `\\`) are allowed.
- `^^` is rejected because `^^5c` is TeX's hex notation for a backslash and would bypass the allowlist.
- Non-ASCII text is rejected because MathTex cannot typeset it. Use a `text` object for Japanese and other scripts.

This blocks commands such as `\input`, `\include`, `\write`, `\def`, and `\csname`, which could render local files into the video or change how TeX parses the input.

## JSON Schema

`npm run generate:schema` writes `schema/blueprint.schema.json` from `BlueprintSchema` with `z.toJSONSchema` (draft 2020-12).

- **Ollama:** used as `format` to constrain generation.
- **Python renderer:** used for the structural check with `jsonschema`.

JSON Schema expresses only the structure in `blueprint.ts`. The rules in `rules.ts` must be implemented again in Python. Keep `blueprint.ts` free of `refine` and `transform`, because they do not appear in the generated schema. Put such checks in `rules.ts`.

## Issue codes

| Code                      | Raised by       | Meaning                                                                |
| ------------------------- | --------------- | ---------------------------------------------------------------------- |
| `invalid_json`            | `validate.ts`   | Input is not valid JSON.                                               |
| `schema_error`            | Zod             | Any other structural problem, such as a wrong type or a missing field. |
| `unknown_field`           | Zod             | A field not defined by the schema.                                     |
| `unsupported_object_type` | Zod             | Unknown `objects[].type`.                                              |
| `unsupported_action`      | Zod             | Unknown `animations[].action`.                                         |
| `out_of_range`            | Zod, rules      | Value outside its range, or a range where min ≥ max.                   |
| `duplicate_id`            | rules           | Two objects share an id.                                               |
| `unknown_reference`       | rules           | Reference to an object that does not exist.                            |
| `invalid_reference`       | rules           | Reference to the wrong kind of object.                                 |
| `exceeds_duration`        | rules           | Animation ends after `scene.duration`.                                 |
| `target_overlap`          | rules           | Two animations on one object overlap in time.                          |
| `lifecycle_violation`     | rules           | Action not allowed in the object's current state.                      |
| `invalid_expression`      | rules           | Graph expression outside the grammar, or too many `sum()` terms.       |
| `forbidden_latex`         | rules           | LaTeX command, environment, or character not allowed.                  |
| `never_appears`           | rules (warning) | Visual object is never shown.                                          |

## Testing

`npm test` runs `tsc --noEmit` first and then `src/**/*.test.ts`. The tests check that:

- Every fixture in `tests/renderer-fixtures/` gives exactly the result in `expectations.json`. Valid fixtures pass with no warnings. Each `invalid-*` fixture fails with exactly one issue whose code and path are listed there.
- `schema/blueprint.schema.json` matches what `blueprint.ts` generates.
- The expression grammar and the LaTeX allowlist accept and reject representative inputs.

## Changing the schema

To add an object type or an action:

1. Add it to `blueprint.ts`, using `visualObject()` or `animation()`.
2. Add any cross-field rules for it to `rules.ts`, such as new references or a new lifecycle effect.
3. Run `npm run generate:schema` and commit `schema/blueprint.schema.json`.
4. Add a valid fixture and, where useful, an `invalid-*` fixture. Record both in `expectations.json`.
5. Implement the same object or action and the same rules in the Python renderer.

A change that makes previously valid Blueprints invalid also requires changing `BLUEPRINT_VERSION`.
