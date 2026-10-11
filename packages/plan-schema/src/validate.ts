import { z } from "zod";
import { PlanObjectSchema, crossChecks, type Plan } from "./schema.js";
import { show } from "./text.js";

export type PlanError = { path: string; message: string };
export type ValidationResult = { ok: true; plan: Plan } | { ok: false; errors: PlanError[] };

/** Plans larger than this (as JSON) are rejected before any parsing. */
export const MAX_PLAN_BYTES = 64 * 1024;
/** At most this many errors are returned, followed by one "and N more problems" entry. */
export const MAX_ERRORS = 25;
const MAX_LISTED_KEYS = 5;

/** ["logs", 1, "fields", 0, "key"] becomes "logs[1].fields[0].key". */
export function formatPath(path: (string | number)[]): string {
  if (path.length === 0) return "(plan)";
  return path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), "");
}

function describeIssue(issue: z.ZodIssue): string {
  const where = show(formatPath(issue.path), 80);
  const subject = issue.path.length === 0 ? "The plan" : `"${where}"`;
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return `${subject} is missing. It is required`;
      return `${subject} must be ${article(issue.expected)} but got ${issue.received}`;
    case z.ZodIssueCode.unrecognized_keys: {
      const n = issue.keys.length;
      const listed = issue.keys.slice(0, MAX_LISTED_KEYS).map((k) => `"${show(k)}"`).join(", ");
      const more = n > MAX_LISTED_KEYS ? ` and ${n - MAX_LISTED_KEYS} more` : "";
      return `Unknown ${n > 1 ? "properties" : "property"} ${listed}${more}. Remove ${n > 1 ? "them" : "it"}; only the properties in the schema are allowed`;
    }
    case z.ZodIssueCode.invalid_union_discriminator:
      return issue.message;
    default:
      return issue.message;
  }
}

function article(expected: string): string {
  return expected === "array" || expected === "object" ? `an ${expected}` : expected === "integer" ? "a whole number" : `a ${expected}`;
}

/** Turns issues into at most MAX_ERRORS errors plus a final "and N more problems". */
export function toErrors(issues: z.ZodIssue[]): PlanError[] {
  const errors = issues.slice(0, MAX_ERRORS).map((issue) => ({ path: formatPath(issue.path), message: describeIssue(issue) }));
  if (issues.length > MAX_ERRORS) errors.push({ path: "(plan)", message: `and ${issues.length - MAX_ERRORS} more problems` });
  return errors;
}

/** Serialized size of the input, or null when it cannot be serialized at all. */
export function jsonSize(input: unknown): number | null {
  try {
    const s = JSON.stringify(input);
    return s === undefined ? 0 : s.length;
  } catch {
    return null;
  }
}

/**
 * Check untrusted input (usually AI output) against the plan schema.
 * Messages are plain language so they can be sent straight back to the AI for one retry.
 * Cross-plan rules only run once the shape is valid, so a broken plan cannot trigger a flood of errors.
 */
export function validatePlan(input: unknown): ValidationResult {
  const size = jsonSize(input);
  if (size === null) return { ok: false, errors: [{ path: "(plan)", message: "The plan could not be read as JSON data" }] };
  if (size > MAX_PLAN_BYTES) {
    return { ok: false, errors: [{ path: "(plan)", message: `The plan is too large (over ${MAX_PLAN_BYTES / 1024} KB). Shorten it and stay within the limits` }] };
  }
  const result = PlanObjectSchema.safeParse(input);
  if (!result.success) return { ok: false, errors: toErrors(result.error.issues) };

  const issues: z.ZodIssue[] = [];
  crossChecks(result.data, {
    addIssue: (i) => issues.push({ ...i, path: i.path ?? [], message: i.message ?? "" } as z.ZodIssue),
  });
  if (issues.length > 0) return { ok: false, errors: toErrors(issues) };
  return { ok: true, plan: result.data };
}
