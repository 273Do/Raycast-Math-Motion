export {
  BLUEPRINT_VERSION,
  BlueprintSchema,
  LIMITS,
  toBlueprintJsonSchema,
  type AnimationAction,
  type Blueprint,
  type BlueprintAnimation,
  type BlueprintObject,
  type ObjectType,
} from "@/schema/blueprint";
export type { BlueprintIssue, BlueprintIssueCode } from "@/schema/issues";
export { validateBlueprint, validateBlueprintJson, type ValidationResult } from "@/schema/validate";
