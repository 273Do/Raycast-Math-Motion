# Renderer Fixtures

Hand-written Animation Blueprints used to pin down schema v1 and drive the Python renderer before the LLM is connected.
`expectations.json` lists, for every fixture, whether it must render or which error `code` it must be rejected with.
`acceptance` refers to the numbered acceptance tests in `docs/math-animation-mvp-spec.md` §11.

Each `invalid-*` fixture is a valid fixture with exactly one defect, so a rejection can only have one cause.

## Conventions these fixtures assume

These are decisions not spelled out in the spec. The schema (`src/schema/blueprint.ts`, cross-field rules in `src/schema/rules.ts`) should follow them or the fixtures should be updated together.

- **Units:** `position`, `to`, and geometry are Manim scene units (visible frame ≈ x ±7.1, y ±4), not pixels.
- **`position`** is the center of the object. Geometry in `data` (`start`/`end`, `points`) is relative to that center.
- **Angles** are in degrees (`rotate.params.angle`).
- **Intervals** are half-open `[start, start + duration)`. Two animations on the same target may touch (one ends when the next starts) but not overlap.
- **Lifecycle:** `create` / `write` / `fade_in` are entrance actions. `transform` exits its `target` and enters `params.into` (`ReplacementTransform`).
- **`parameter`** objects are not drawn and have no `position` / `style`. They need no entrance action. Graph expressions reference them by `id`.
- **`graph`** is drawn in its axes' coordinates; its own `position` and `style.scale` are not used. A graph that references parameters is redrawn every frame.
- **Shapes** (`circle`, `rectangle`, `polygon`, `line`) are outlines; `dot`, `arrow` tips, `text`, and `math` are filled.
- **Expressions** use `^` for powers, the variable `x`, parameter ids, `pi`, `e`, common functions (`sin`, `cos`, `exp`, …), and `sum(k, from, to, expr)`.

## Object `data` / action `params` used

| Type             | `data`                           |
| ---------------- | -------------------------------- |
| `text`           | `text`, `fontSize`               |
| `math`           | `latex`, `fontSize`              |
| `axes`           | `xRange`, `yRange`               |
| `graph`          | `expression`, `xRange`, `axesId` |
| `circle` / `dot` | `radius`                         |
| `rectangle`      | `width`, `height`                |
| `line` / `arrow` | `start`, `end`                   |
| `polygon`        | `points` (≥ 3)                   |
| `parameter`      | `initial`, `integer`             |

| Action                                               | `params`            |
| ---------------------------------------------------- | ------------------- |
| `create`, `write`, `fade_in`, `fade_out`, `indicate` | `{}`                |
| `move`                                               | `to: [x, y]`        |
| `rotate`                                             | `angle` (degrees)   |
| `scale`                                              | `factor`            |
| `transform`                                          | `into: <object id>` |
| `animate_parameter`                                  | `to`                |

## Renderer

`assets/renderer/render.py` renders a fixture with Manim:

```sh
"$MANIM_PYTHON" assets/renderer/render.py tests/renderer-fixtures/graph.json --output out.mp4 --quality low
```

`npm run test:renderer` renders every valid fixture and checks the frame count. It renders with the extension's venv (installed from the setup screen) on macOS, or with `MANIM_PYTHON` when set. Fixtures with `math` objects are skipped when LaTeX is not installed.

## Notes

- `circle-rotate.json`: rotating a plain circle is not visible in the output. It only checks that the pipeline produces a playable MP4 (acceptance test 1).
- `timeline-overlap.json` covers partial overlap (`circle`/`square` create), concurrent actions on different targets (`move` + `rotate`), touching intervals on one target (`square`), a gap with nothing playing (3.5–4s), and trailing time filled with a wait (6–7s).
