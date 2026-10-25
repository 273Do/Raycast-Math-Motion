import { LIMITS } from "@/schema";

/**
 * Fixes LLM mistakes that have only one sensible fix, before validation.
 * Takes and returns unvalidated input, so every field is checked before use.
 */
export const normalizeBlueprint = (input: unknown): unknown => {
  return fitSceneDuration(input);
};

/** Extends `scene.duration` to cover the last animation, as long as it stays within the limit. */
const fitSceneDuration = (input: unknown): unknown => {
  if (!isRecord(input) || !isRecord(input.scene) || !Array.isArray(input.animations)) return input;
  const { duration } = input.scene;
  if (typeof duration !== "number") return input;

  const end = input.animations.reduce<number>((max, animation) => {
    if (!isRecord(animation) || typeof animation.start !== "number" || typeof animation.duration !== "number") {
      return max;
    }
    return Math.max(max, animation.start + animation.duration);
  }, 0);

  if (end <= duration || end > LIMITS.scene.duration.max) return input;
  return { ...input, scene: { ...input.scene, duration: end } };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
