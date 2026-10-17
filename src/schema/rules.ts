/** Cross-field rules: ids, references, timing, lifecycle, expressions, LaTeX. */
import { Blueprint, BlueprintAnimation, BlueprintObject, LIMITS } from "@/schema/blueprint";
import { collectSums, ExpressionError, parseExpression } from "@/schema/expression";
import { BlueprintIssue } from "@/schema/issues";
import { checkLatex } from "@/schema/latex";

const ENTRANCE_ACTIONS: ReadonlySet<BlueprintAnimation["action"]> = new Set(["create", "write", "fade_in"]);

// Floating-point slack for timing comparisons.
const EPSILON = 1e-9;

export const checkRules = (blueprint: Blueprint): { errors: BlueprintIssue[]; warnings: BlueprintIssue[] } => {
  const errors: BlueprintIssue[] = [];
  const warnings: BlueprintIssue[] = [];

  const objects = checkObjects(blueprint, errors);
  checkExpressionsAndLatex(blueprint, objects, errors);
  checkReferences(blueprint, objects, errors);
  // Timing and lifecycle assume every reference resolves.
  if (errors.length === 0) {
    checkTiming(blueprint, errors);
    checkLifecycle(blueprint, objects, errors, warnings);
  }

  return { errors, warnings };
};

const checkObjects = (blueprint: Blueprint, errors: BlueprintIssue[]): Map<string, BlueprintObject> => {
  const objects = new Map<string, BlueprintObject>();

  blueprint.objects.forEach((object, index) => {
    const path = `objects[${index}]`;
    if (objects.has(object.id)) {
      errors.push({ code: "duplicate_id", path: `${path}.id`, message: `Duplicate object id "${object.id}"` });
    } else {
      objects.set(object.id, object);
    }

    const ranges: [string, [number, number]][] = [];
    if (object.type === "axes") ranges.push(["xRange", object.data.xRange], ["yRange", object.data.yRange]);
    if (object.type === "graph") ranges.push(["xRange", object.data.xRange]);
    for (const [field, [min, max]] of ranges) {
      if (min >= max) {
        errors.push({ code: "out_of_range", path: `${path}.data.${field}`, message: "min must be less than max" });
      }
    }
  });

  return objects;
};

/** Largest absolute value a parameter takes over the whole scene. */
const parameterExtent = (blueprint: Blueprint, id: string, initial: number): number => {
  return blueprint.animations.reduce(
    (extent, animation) =>
      animation.action === "animate_parameter" && animation.target === id
        ? Math.max(extent, Math.abs(animation.params.to))
        : extent,
    Math.abs(initial),
  );
};

const checkExpressionsAndLatex = (
  blueprint: Blueprint,
  objects: Map<string, BlueprintObject>,
  errors: BlueprintIssue[],
) => {
  const parameters = new Map<string, number>();
  for (const object of objects.values()) {
    if (object.type === "parameter") {
      parameters.set(object.id, parameterExtent(blueprint, object.id, object.data.initial));
    }
  }

  blueprint.objects.forEach((object, index) => {
    if (object.type === "graph") {
      const path = `objects[${index}].data.expression`;
      try {
        const ast = parseExpression(object.data.expression, { parameters: new Set(parameters.keys()) });
        for (const sum of collectSums(ast)) {
          const bound = (b: typeof sum.from) => (b.kind === "number" ? b.value : parameters.get(b.name)!);
          const terms = Math.abs(bound(sum.to) - bound(sum.from)) + 1;
          if (terms > LIMITS.sumTerms) {
            errors.push({
              code: "invalid_expression",
              path,
              message: `sum() can have at most ${LIMITS.sumTerms} terms (up to ${Math.ceil(terms)} here)`,
            });
          }
        }
      } catch (error) {
        if (!(error instanceof ExpressionError)) throw error;
        errors.push({ code: "invalid_expression", path, message: error.message });
      }
    }

    if (object.type === "math") {
      const problem = checkLatex(object.data.latex);
      if (problem) {
        errors.push({ code: "forbidden_latex", path: `objects[${index}].data.latex`, message: problem.message });
      }
    }
  });
};

const checkReferences = (blueprint: Blueprint, objects: Map<string, BlueprintObject>, errors: BlueprintIssue[]) => {
  blueprint.objects.forEach((object, index) => {
    if (object.type !== "graph") return;
    const path = `objects[${index}].data.axesId`;
    const axes = objects.get(object.data.axesId);
    if (!axes) {
      errors.push({ code: "unknown_reference", path, message: `Unknown object "${object.data.axesId}"` });
    } else if (axes.type !== "axes") {
      errors.push({ code: "invalid_reference", path, message: `"${object.data.axesId}" is not an axes object` });
    }
  });

  blueprint.animations.forEach((animation, index) => {
    const path = `animations[${index}]`;
    const target = objects.get(animation.target);
    if (!target) {
      errors.push({
        code: "unknown_reference",
        path: `${path}.target`,
        message: `Unknown object "${animation.target}"`,
      });
      return;
    }

    const isParameter = target.type === "parameter";
    if (isParameter !== (animation.action === "animate_parameter")) {
      errors.push({
        code: "invalid_reference",
        path: `${path}.target`,
        message: isParameter
          ? `Parameter "${animation.target}" can only be used with animate_parameter`
          : `animate_parameter requires a parameter object, but "${animation.target}" is a ${target.type}`,
      });
    }

    if (animation.action === "transform") {
      const into = objects.get(animation.params.into);
      const intoPath = `${path}.params.into`;
      if (!into) {
        errors.push({
          code: "unknown_reference",
          path: intoPath,
          message: `Unknown object "${animation.params.into}"`,
        });
      } else if (into.type === "parameter" || into.id === animation.target) {
        errors.push({ code: "invalid_reference", path: intoPath, message: `Cannot transform into "${into.id}"` });
      }
    }
  });
};

const checkTiming = (blueprint: Blueprint, errors: BlueprintIssue[]) => {
  const busy = new Map<string, { start: number; end: number; index: number }[]>();

  blueprint.animations.forEach((animation, index) => {
    const path = `animations[${index}]`;
    const end = animation.start + animation.duration;

    if (end > blueprint.scene.duration + EPSILON) {
      errors.push({
        code: "exceeds_duration",
        path,
        message: `Ends at ${end}s, after the scene duration of ${blueprint.scene.duration}s`,
      });
    }

    // A transform also occupies the object it turns into.
    const ids = animation.action === "transform" ? [animation.target, animation.params.into] : [animation.target];
    for (const id of ids) {
      const intervals = busy.get(id) ?? [];
      // Intervals are half-open, so one animation may start exactly when another ends.
      const clash = intervals.find((other) => animation.start < other.end - EPSILON && other.start < end - EPSILON);
      if (clash) {
        errors.push({
          code: "target_overlap",
          path,
          message: `Overlaps animations[${clash.index}] on "${id}"; one object cannot run two animations at once`,
        });
      }
      intervals.push({ start: animation.start, end, index });
      busy.set(id, intervals);
    }
  });
};

type LifecycleState = "pending" | "visible" | "gone";

/**
 * Each visual object moves pending → visible → gone. Re-entering after fade_out or
 * transform is not allowed in v1: ReplacementTransform reshapes the source mobject,
 * so bringing it back would not show the original object.
 */
const checkLifecycle = (
  blueprint: Blueprint,
  objects: Map<string, BlueprintObject>,
  errors: BlueprintIssue[],
  warnings: BlueprintIssue[],
) => {
  const state = new Map<string, LifecycleState>();
  for (const object of objects.values()) {
    state.set(object.id, object.type === "parameter" ? "visible" : "pending");
  }

  // Overlaps on one target are already rejected, so ordering by start time is enough.
  const ordered = blueprint.animations
    .map((animation, index) => ({ animation, index }))
    .sort((a, b) => a.animation.start - b.animation.start);

  for (const { animation, index } of ordered) {
    const path = `animations[${index}]`;
    const current = state.get(animation.target);

    if (ENTRANCE_ACTIONS.has(animation.action)) {
      if (current !== "pending") {
        errors.push({
          code: "lifecycle_violation",
          path,
          message: `"${animation.target}" ${current === "visible" ? "is already on screen" : "has already left the scene"}`,
        });
      }
      state.set(animation.target, "visible");
      continue;
    }

    if (current !== "visible") {
      errors.push({
        code: "lifecycle_violation",
        path,
        message: `"${animation.target}" ${current === "pending" ? "has not appeared yet" : "has already left the scene"}; ${animation.action} needs it on screen`,
      });
    }

    if (animation.action === "fade_out") {
      state.set(animation.target, "gone");
    } else if (animation.action === "transform") {
      const into = animation.params.into;
      if (state.get(into) !== "pending") {
        errors.push({
          code: "lifecycle_violation",
          path: `${path}.params.into`,
          message: `"${into}" must not have appeared before it is transformed into`,
        });
      }
      state.set(animation.target, "gone");
      state.set(into, "visible");
    }
  }

  blueprint.objects.forEach((object, index) => {
    if (state.get(object.id) === "pending") {
      warnings.push({
        code: "never_appears",
        path: `objects[${index}]`,
        message: `"${object.id}" never appears; add a create, write, or fade_in animation`,
      });
    }
  });
};
