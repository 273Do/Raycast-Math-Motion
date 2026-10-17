export type BlueprintIssueCode =
  | "invalid_json"
  | "schema_error"
  | "unknown_field"
  | "unsupported_object_type"
  | "unsupported_action"
  | "out_of_range"
  | "duplicate_id"
  | "unknown_reference"
  | "invalid_reference"
  | "exceeds_duration"
  | "target_overlap"
  | "lifecycle_violation"
  | "invalid_expression"
  | "forbidden_latex"
  // Warnings
  | "never_appears";

export type BlueprintIssue = {
  code: BlueprintIssueCode;
  /** Location such as `animations[1].target`. */
  path: string;
  message: string;
};
