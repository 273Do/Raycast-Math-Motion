import { ChatMessage } from "@/lib/ollama";
import { Blueprint, BLUEPRINT_VERSION, BlueprintIssue, BlueprintIssueCode, LIMITS } from "@/schema";

/** Few-shot examples for the system prompt. They must stay valid; `prompt.test.ts` checks them. */
export const EXAMPLE_BLUEPRINT: Blueprint = {
  version: BLUEPRINT_VERSION,
  title: "Parabola and a moving point",
  scene: { width: 1280, height: 720, fps: 30, background: "#101014", duration: 8 },
  objects: [
    {
      id: "title",
      type: "text",
      position: [0, 3.4],
      style: { color: "#FFFFFF", opacity: 1, scale: 1 },
      data: { text: "y = x²", fontSize: 40 },
    },
    {
      id: "axes",
      type: "axes",
      position: [0, -0.5],
      style: { color: "#B8B8C8", opacity: 1, scale: 1 },
      data: { xRange: [-3, 3], yRange: [-1, 9] },
    },
    {
      id: "parabola",
      type: "graph",
      position: [0, -0.5],
      style: { color: "#58C4DD", opacity: 1, scale: 1 },
      data: { expression: "x^2", xRange: [-3, 3], axesId: "axes" },
    },
    {
      id: "point",
      type: "dot",
      position: [-2, 1],
      style: { color: "#FC6255", opacity: 1, scale: 1 },
      data: { radius: 0.1 },
    },
  ],
  animations: [
    { target: "title", action: "write", start: 0, duration: 1, params: {} },
    { target: "axes", action: "create", start: 1, duration: 1.5, params: {} },
    { target: "parabola", action: "create", start: 2.5, duration: 2, params: {} },
    { target: "point", action: "fade_in", start: 4.5, duration: 0.5, params: {} },
    { target: "point", action: "move", start: 5, duration: 2, params: { to: [2, 1] } },
    { target: "point", action: "indicate", start: 7, duration: 1, params: {} },
  ],
};

const PARAMETER_EXAMPLE_BLUEPRINT: Blueprint = {
  version: BLUEPRINT_VERSION,
  title: "Changing the amplitude of a sine wave",
  scene: { width: 1280, height: 720, fps: 30, background: "#101014", duration: 9 },
  objects: [
    { id: "a", type: "parameter", data: { initial: 1, integer: false } },
    {
      id: "formula",
      type: "math",
      position: [0, 3.3],
      style: { color: "#FFFFFF", opacity: 1, scale: 1 },
      data: { latex: "y = a \\sin(x)", fontSize: 44 },
    },
    {
      id: "axes",
      type: "axes",
      position: [0, -0.5],
      style: { color: "#B8B8C8", opacity: 1, scale: 1 },
      data: { xRange: [-6.3, 6.3], yRange: [-3, 3] },
    },
    {
      id: "wave",
      type: "graph",
      position: [0, -0.5],
      style: { color: "#83C167", opacity: 1, scale: 1 },
      data: { expression: "a * sin(x)", xRange: [-6.3, 6.3], axesId: "axes" },
    },
  ],
  animations: [
    { target: "formula", action: "write", start: 0, duration: 1, params: {} },
    { target: "axes", action: "create", start: 0.5, duration: 1.5, params: {} },
    { target: "wave", action: "create", start: 2, duration: 1.5, params: {} },
    { target: "a", action: "animate_parameter", start: 4, duration: 2.5, params: { to: 2.5 } },
    { target: "a", action: "animate_parameter", start: 6.5, duration: 2.5, params: { to: 0.5 } },
  ],
};

export const EXAMPLE_BLUEPRINTS = [EXAMPLE_BLUEPRINT, PARAMETER_EXAMPLE_BLUEPRINT];

export const SYSTEM_PROMPT = `You design math animations. Reply with a single JSON "Animation Blueprint" that the renderer turns into a Manim video. Output JSON only.

# Structure
{ "version": "${BLUEPRINT_VERSION}", "title", "scene": { "width", "height", "fps", "background", "duration" }, "objects": [...], "animations": [...] }
- Use scene { "width": 1280, "height": 720, "fps": 30 } and a dark background such as "#101014".
- scene.duration is in seconds, at most ${LIMITS.scene.duration.max}. Up to ${LIMITS.maxObjects} objects and ${LIMITS.maxAnimations} animations.

# Objects
Every visual object has "id" (lowercase snake_case, unique), "type", "position" ([x, y], the center), "style" ({ "color": "#RRGGBB", "opacity": 0-1, "scale": >0 }) and "data":
- text: { "text", "fontSize" } — plain text, any language. Use this for words.
- math: { "latex", "fontSize" } — LaTeX math body without $. ASCII only: write \\pi and x^2, never π or ². Common commands only (\\frac, \\sqrt, \\sum, \\int, Greek letters, ...).
- axes: { "xRange": [min, max], "yRange": [min, max] }
- graph: { "expression", "xRange", "axesId" } — a function of x drawn on the axes "axesId". Give the graph the same position as its axes.
- circle: { "radius" } (≤ 4), dot: { "radius" } (≤ 0.5), rectangle: { "width", "height" }
- line / arrow: { "start": [x, y], "end": [x, y] } — relative to position.
- polygon: { "points": [[x, y], ...] } — ${LIMITS.polygonPoints.min} to ${LIMITS.polygonPoints.max} vertices relative to position.
- parameter: { "id", "type": "parameter", "data": { "initial", "integer" } } — no position or style. An invisible number that graph expressions can use and "animate_parameter" can change.

# Animations
Each animation is { "target", "action", "start", "duration", "params" }. Times are in seconds.
- "create", "write", "fade_in": make a hidden object appear. params {}. Use "write" for text and math.
- "fade_out": remove an object. params {}.
- "indicate": briefly highlight. params {}.
- "move": params { "to": [x, y] }. "rotate": params { "angle": degrees }. "scale": params { "factor" }.
- "transform": morph the target into another object. params { "into": "<object id>" }. The target disappears and "into" appears; "into" must not have appeared before.
- "animate_parameter": params { "to" }. Only this action may target a parameter.

# Parameters
A parameter is the only way to change a graph over time. Use its id in a graph expression, then run "animate_parameter" on the parameter; the graph redraws continuously as the value changes. There is no time variable such as t.
- Never run "animate_parameter" on a graph, dot, or any other visual object, and never run other actions on a parameter.
- Shapes do not follow graphs or parameters. Move them with "move".

# Rules
- Coordinates are Manim scene units, not pixels. The visible frame is about x ±7, y ±4. Keep everything inside it and avoid overlapping objects.
- Every object starts hidden. Its first animation must be "create", "write", "fade_in", or it must be the "into" of a transform. Every visual object must appear at some point.
- After "fade_out" or being transformed away, an object is gone and cannot be animated again.
- One object never runs two animations at the same time. Animations may touch: one may start exactly when the previous one ends.
- Different objects may animate at the same time.
- Every animation must end by scene.duration (start + duration ≤ scene.duration).
- Graph expressions are plain text, not LaTeX: no backslashes, no \\times or \\cdot. They use x, numbers, pi, e, parameter ids, + - * / ^, parentheses, and the functions sin cos tan asin acos atan sinh cosh tanh exp log sqrt abs floor ceil. Always write * for multiplication: "2 * x", not "2x".
- Finite sums: sum(k, from, to, body), where from and to are integers or parameter ids, at most ${LIMITS.sumTerms} terms.
- Pace the animation so a viewer can follow it, usually 5 to 20 seconds in total.

# Examples
${EXAMPLE_BLUEPRINTS.map((example) => JSON.stringify(example)).join("\n\n")}`;

export const buildMessages = (prompt: string): ChatMessage[] => {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
};

/** Models tend to resend the same reply when only told what is wrong, so this tells them how to fix it. */
const REPAIR_HINTS: Partial<Record<BlueprintIssueCode, string>> = {
  out_of_range: `Bring each listed value inside its range. Coordinates must stay within x ±${LIMITS.coordinate.x} and y ±${LIMITS.coordinate.y}, including relative points, so shrink the drawing or move it toward the center. Parameter values and axis ranges must stay within ±${LIMITS.axisRange}.`,
  target_overlap: "Move the later animation's start to the end of the earlier one, or remove one of them.",
  lifecycle_violation:
    'Make sure each object appears ("create", "write", "fade_in") before any other action, and is never animated after "fade_out" or being transformed away.',
  invalid_expression: 'Write the expression as plain text such as "2 * sin(x)", with no backslashes or LaTeX.',
  forbidden_latex: "Use only ASCII and common LaTeX commands in math. Put other text in a text object.",
  invalid_reference: '"animate_parameter" may only target parameter objects, and parameters accept no other action.',
  unknown_reference: "Refer only to ids defined in objects, or add the missing object.",
};

/** Asks the model to fix its previous reply. The reply is minified to save context. */
export const buildRepairMessages = (history: ChatMessage[], reply: string, issues: BlueprintIssue[]): ChatMessage[] => {
  const list = issues.map((issue) => `- ${issue.path || "<root>"}: ${issue.message} (${issue.code})`).join("\n");
  const hints = [...new Set(issues.map((issue) => REPAIR_HINTS[issue.code]).filter(Boolean))];
  const hintText = hints.length > 0 ? `\n\nHow to fix:\n${hints.map((hint) => `- ${hint}`).join("\n")}` : "";
  return [
    ...history,
    { role: "assistant", content: minify(reply) },
    {
      role: "user",
      content: `The blueprint is invalid:\n${list}${hintText}\n\nChange the blueprint so that every issue is gone, and return the complete corrected blueprint as JSON.`,
    },
  ];
};

const minify = (json: string): string => {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
};
