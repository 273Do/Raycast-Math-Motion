import { z } from "zod";

/**
 * Blueprint v1 structure and value ranges. Source of the generated JSON Schema.
 * Cross-field rules belong in `rules.ts`.
 */

export const BLUEPRINT_VERSION = "1.0";

export const LIMITS = {
  scene: {
    width: { min: 320, max: 1920 },
    height: { min: 240, max: 1080 },
    fps: { min: 15, max: 60 },
    duration: { max: 30 },
  },
  maxObjects: 30,
  maxAnimations: 60,
  // Manim scene units; the visible 16:9 frame is about x ±7.1, y ±4.
  coordinate: { x: 8, y: 4.5 },
  scale: { max: 5 },
  fontSize: { min: 8, max: 144 },
  textLength: 200,
  latexLength: 300,
  expressionLength: 300,
  axisRange: 100,
  polygonPoints: { min: 3, max: 20 },
  sumTerms: 100,
} as const;

const Id = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
  .describe("Lowercase snake_case identifier, unique within the blueprint");

const HexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .describe("Color as #RRGGBB");

const X = z.number().min(-LIMITS.coordinate.x).max(LIMITS.coordinate.x);
const Y = z.number().min(-LIMITS.coordinate.y).max(LIMITS.coordinate.y);

const Point = z.tuple([X, Y]).describe("[x, y] in Manim scene units");

const AxisValue = z.number().min(-LIMITS.axisRange).max(LIMITS.axisRange);
const Range = z.tuple([AxisValue, AxisValue]).describe("[min, max]");

const Style = z.strictObject({
  color: HexColor,
  opacity: z.number().min(0).max(1),
  scale: z.number().positive().max(LIMITS.scale.max),
});

const FontSize = z.number().min(LIMITS.fontSize.min).max(LIMITS.fontSize.max);

const visualObject = <T extends string, D extends z.ZodRawShape>(type: T, data: D) => {
  return z.strictObject({
    id: Id,
    type: z.literal(type),
    position: Point.describe("Center of the object"),
    style: Style,
    data: z.strictObject(data),
  });
};

const TextObject = visualObject("text", {
  text: z.string().min(1).max(LIMITS.textLength),
  fontSize: FontSize,
});

const MathObject = visualObject("math", {
  latex: z.string().min(1).max(LIMITS.latexLength).describe("LaTeX math body without surrounding $"),
  fontSize: FontSize,
});

const AxesObject = visualObject("axes", {
  xRange: Range,
  yRange: Range,
});

const GraphObject = visualObject("graph", {
  expression: z
    .string()
    .min(1)
    .max(LIMITS.expressionLength)
    .describe("Function of x, e.g. sin(x) or x^2 / 2. May reference parameter ids."),
  xRange: Range,
  axesId: Id,
});

const CircleObject = visualObject("circle", {
  radius: z.number().positive().max(4),
});

const DotObject = visualObject("dot", {
  radius: z.number().positive().max(0.5),
});

const RectangleObject = visualObject("rectangle", {
  width: z
    .number()
    .positive()
    .max(2 * LIMITS.coordinate.x),
  height: z
    .number()
    .positive()
    .max(2 * LIMITS.coordinate.y),
});

const LineObject = visualObject("line", {
  start: Point.describe("Relative to position"),
  end: Point.describe("Relative to position"),
});

const ArrowObject = visualObject("arrow", {
  start: Point.describe("Relative to position"),
  end: Point.describe("Relative to position"),
});

const PolygonObject = visualObject("polygon", {
  points: z
    .array(Point)
    .min(LIMITS.polygonPoints.min)
    .max(LIMITS.polygonPoints.max)
    .describe("Vertices relative to position"),
});

const ParameterObject = z
  .strictObject({
    id: Id,
    type: z.literal("parameter"),
    data: z.strictObject({
      initial: z.number().min(-LIMITS.axisRange).max(LIMITS.axisRange),
      integer: z.boolean().describe("When true, the value is read as floor(value + 0.5)"),
    }),
  })
  .describe("Invisible numeric value that graph expressions can reference and animate_parameter can change");

export const BlueprintObject = z.discriminatedUnion("type", [
  TextObject,
  MathObject,
  AxesObject,
  GraphObject,
  CircleObject,
  DotObject,
  RectangleObject,
  LineObject,
  ArrowObject,
  PolygonObject,
  ParameterObject,
]);

const Empty = z.strictObject({});

const animation = <A extends string, P extends z.ZodType>(action: A, params: P) => {
  return z.strictObject({
    target: Id,
    action: z.literal(action),
    start: z.number().min(0).max(LIMITS.scene.duration.max).describe("Seconds from the scene start"),
    duration: z.number().positive().max(LIMITS.scene.duration.max).describe("Seconds"),
    params,
  });
};

export const BlueprintAnimation = z.discriminatedUnion("action", [
  animation("create", Empty),
  animation("write", Empty),
  animation("fade_in", Empty),
  animation("fade_out", Empty),
  animation("indicate", Empty),
  animation("move", z.strictObject({ to: Point })),
  animation("rotate", z.strictObject({ angle: z.number().min(-3600).max(3600).describe("Degrees") })),
  animation("scale", z.strictObject({ factor: z.number().positive().max(LIMITS.scale.max) })),
  animation("transform", z.strictObject({ into: Id.describe("Object that replaces the target") })),
  animation("animate_parameter", z.strictObject({ to: z.number().min(-LIMITS.axisRange).max(LIMITS.axisRange) })),
]);

export const Scene = z.strictObject({
  width: z.int().min(LIMITS.scene.width.min).max(LIMITS.scene.width.max),
  height: z.int().min(LIMITS.scene.height.min).max(LIMITS.scene.height.max),
  fps: z.int().min(LIMITS.scene.fps.min).max(LIMITS.scene.fps.max),
  background: HexColor,
  duration: z.number().positive().max(LIMITS.scene.duration.max).describe("Seconds"),
});

export const BlueprintSchema = z.strictObject({
  version: z.literal(BLUEPRINT_VERSION),
  title: z.string().min(1).max(LIMITS.textLength),
  scene: Scene,
  objects: z.array(BlueprintObject).min(1).max(LIMITS.maxObjects),
  animations: z.array(BlueprintAnimation).min(1).max(LIMITS.maxAnimations),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
export type BlueprintObject = z.infer<typeof BlueprintObject>;
export type BlueprintAnimation = z.infer<typeof BlueprintAnimation>;
export type ObjectType = BlueprintObject["type"];
export type AnimationAction = BlueprintAnimation["action"];

export const toBlueprintJsonSchema = () => {
  return z.toJSONSchema(BlueprintSchema, { target: "draft-2020-12" });
};
