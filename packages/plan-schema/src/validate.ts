import { z } from "zod";
import { PlanSchema, type Plan } from "./schema.js";

export type PlanError = { path: string; message: string };
export type ValidationResult = { ok: true; plan: Plan } | { ok: false; errors: PlanError[] };

/** ["logs", 1, "fields", 0, "key"] becomes "logs[1].fields[0].key". */
export function formatPath(path: (string | number)[]): string {
  if (path.length === 0) return "(plan)";
  return path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), "");
}

function describeIssue(issue: z.ZodIssue): string {
  const where = formatPath(issue.path);
  const subject = issue.path.length === 0 ? "The plan" : `"${where}"`;
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return `${subject} is missing. It is required`;
      return `${subject} must be ${article(issue.expected)} but got ${issue.received}`;
    case z.ZodIssueCode.unrecognized_keys:
      return `Unknown ${issue.keys.length > 1 ? "properties" : "property"} ${issue.keys.map((k) => `"${k}"`).join(", ")}. Remove ${issue.keys.length > 1 ? "them" : "it"}; only the properties in the schema are allowed`;
    case z.ZodIssueCode.invalid_union_discriminator:
      return issue.message;
    default:
      return issue.message;
  }
}

function article(expected: string): string {
  return expected === "array" || expected === "object" ? `an ${expected}` : expected === "integer" ? "a whole number" : `a ${expected}`;
}

/**
 * Check untrusted input (usually AI output) against the plan schema.
 * Messages are plain language so they can be sent straight back to the AI for one retry.
 */
export function validatePlan(input: unknown): ValidationResult {
  const result = PlanSchema.safeParse(input);
  if (result.success) return { ok: true, plan: result.data };
  const errors = result.error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: describeIssue(issue),
  }));
  return { ok: false, errors };
}
