import { z } from "zod";
import { Blueprint, BlueprintSchema } from "@/schema/blueprint";
import { BlueprintIssue } from "@/schema/issues";
import { checkRules } from "@/schema/rules";

export type ValidationResult =
  | { ok: true; blueprint: Blueprint; warnings: BlueprintIssue[] }
  | { ok: false; errors: BlueprintIssue[]; warnings: BlueprintIssue[] };

export const validateBlueprintJson = (text: string): ValidationResult => {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ code: "invalid_json", path: "", message }], warnings: [] };
  }
  return validateBlueprint(input);
};

export const validateBlueprint = (input: unknown): ValidationResult => {
  const parsed = BlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.flatMap(fromZodIssue), warnings: [] };
  }

  const blueprint = parsed.data;
  const { errors, warnings } = checkRules(blueprint);
  return errors.length === 0 ? { ok: true, blueprint, warnings } : { ok: false, errors, warnings };
};

const formatPath = (path: PropertyKey[]): string => {
  return path.reduce<string>((result, key) => {
    if (typeof key === "number") return `${result}[${key}]`;
    return result ? `${result}.${String(key)}` : String(key);
  }, "");
};

const fromZodIssue = (issue: z.core.$ZodIssue): BlueprintIssue[] => {
  const path = formatPath(issue.path);

  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        code: "unknown_field",
        path: formatPath([...issue.path, key]),
        message: `Unknown field "${key}"`,
      }));
    case "invalid_union": {
      // An unknown `type` / `action` value matches no branch of the discriminated union.
      const { discriminator, options } = issue as { discriminator?: string; options?: unknown[] };
      if (discriminator === "action" || discriminator === "type") {
        const kind = discriminator === "action" ? "action" : "object type";
        return [
          {
            code: discriminator === "action" ? "unsupported_action" : "unsupported_object_type",
            path,
            message: `Unsupported ${kind}; expected one of ${options?.join(", ")}`,
          },
        ];
      }
      break;
    }
    case "too_big":
    case "too_small":
      return [{ code: "out_of_range", path, message: issue.message }];
  }

  return [{ code: "schema_error", path, message: issue.message }];
};
