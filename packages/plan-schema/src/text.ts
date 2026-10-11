import { z } from "zod";
import { LIMITS } from "./limits.js";

/*
 * TEXT SAFETY RULE (decided in Phase 1)
 *
 * Every piece of plan text (names, labels, options, emails) is trimmed first,
 * then must be 1..max characters and pass ALL of these:
 *   1. Does not start with "=" or "@"  (spreadsheet formula / mention triggers).
 *   2. Does not start with "+" or "-" immediately followed by a digit or "("
 *      (these are read as numbers or formulas). So "-5", "+1 phone", "-(x)" fail.
 *   3. Contains no control characters (U+0000-U+001F, U+007F-U+009F), which
 *      includes tabs and newlines in the middle of a string.
 * Allowed on purpose: "- Other -", "+ Add new", "Q&A", "A=B" (an "=" that is not
 * the first character). Leading/trailing whitespace is trimmed, never rejected,
 * so " =A1" is trimmed to "=A1" and then rejected by rule 1.
 * The engine must still write cells as plain text (defense in depth).
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
const FORMULA_START = /^[=@]/;
const SIGN_START = /^[+-][0-9(]/;

/** Returns a plain-language problem with the text, or null if it is fine. */
export function textProblem(value: string): string | null {
  if (CONTROL_CHARS.test(value)) {
    return "contains a control character (tab, line break, or hidden character). Use plain text on one line";
  }
  if (FORMULA_START.test(value)) {
    return `starts with "${value[0]}", which a spreadsheet could treat as a formula. Start with a letter or number instead`;
  }
  if (SIGN_START.test(value)) {
    return `starts with "${value[0]}" followed by a digit or "(", which a spreadsheet could treat as a number or formula. Reword it (for example write "Plus one" or put a letter first)`;
  }
  return null;
}

/** Trimmed, length-capped, safe plain text. */
export function safeText(what: string, max: number = LIMITS.maxNameLength) {
  return z
    .string({
      required_error: `${what} is required`,
      invalid_type_error: `${what} must be text`,
    })
    .trim()
    .min(1, `${what} must not be empty`)
    .max(max, `${what} must be at most ${max} characters`)
    .superRefine((value, ctx) => {
      const problem = textProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} ${problem}` });
    });
}

/** Trimmed email address that also passes the text safety rule. */
export function emailText(what: string) {
  return z
    .string({
      required_error: `${what} is required`,
      invalid_type_error: `${what} must be text`,
    })
    .trim()
    .max(LIMITS.maxEmailLength, `${what} must be at most ${LIMITS.maxEmailLength} characters`)
    .superRefine((value, ctx) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} must be a valid email address like name@example.com` });
        return;
      }
      const problem = textProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} ${problem}` });
    });
}

/** Keys and ids: lowercase letters, numbers, underscores. */
export function keyText(what: string) {
  return z
    .string({
      required_error: `${what} is required`,
      invalid_type_error: `${what} must be text`,
    })
    .trim()
    .min(1, `${what} must not be empty`)
    .max(LIMITS.maxKeyLength, `${what} must be at most ${LIMITS.maxKeyLength} characters`)
    .regex(/^[a-z0-9_]+$/, `${what} must use only lowercase letters, numbers, and underscores (no spaces or capitals)`);
}
