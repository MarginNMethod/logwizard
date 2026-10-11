import { z } from "zod";
import { LIMITS } from "./limits.js";

/*
 * TEXT SAFETY RULE (Phase 1, hardened in the fix pass)
 *
 * Every piece of plan text (names, labels, options, emails) is trimmed, normalised
 * to Unicode NFKC, trimmed again, then must be 1..max characters and pass ALL of these:
 *   1. Does not start with "=" or "@"  (spreadsheet formula / mention triggers).
 *   2. Does not start with "+" or "-" unless that sign is followed by whitespace
 *      or ends the text. So "+SUM(A1)", "-A1", "+1 phone", "-5" fail, while
 *      "- Other -", "+ Add new" and "-" are fine.
 *   3. Contains no control, format, surrogate, private-use, line-separator, or
 *      paragraph-separator characters (Unicode Cc, Cf, Cs, Co, Zl, Zp). This covers
 *      tabs, newlines, zero-width characters, bidi overrides, and tag characters.
 * NFKC first means look-alikes such as a full-width "=" are caught and the stored
 * value is already folded, so duplicate checks compare the folded text.
 * Allowed on purpose: "- Other -", "+ Add new", "Q&A", "A=B" (an "=" that is not
 * the first character).
 * The engine must still write cells as plain text (defense in depth).
 */
const BAD_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const FORMULA_START = /^[=@]/;
const SIGN_START = /^[+-](?!\s|$)/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Longest echoed value in an error message. */
export const MAX_ECHO = 40;

/** Shortens a value for use inside an error message. */
export function show(value: unknown, max: number = MAX_ECHO): string {
  const s = typeof value === "string" ? value : String(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

/** Trim, fold to NFKC, trim again. */
export function normalizeText(value: string): string {
  return value.trim().normalize("NFKC").trim();
}

/** Returns a plain-language problem with the text, or null if it is fine. */
export function textProblem(value: string): string | null {
  const v = normalizeText(value);
  if (BAD_CHARS.test(v)) {
    return "contains a control character (tab, line break, or hidden character). Use plain text on one line";
  }
  if (FORMULA_START.test(v)) {
    return `starts with "${v[0]}", which a spreadsheet could treat as a formula. Start with a letter or number instead`;
  }
  if (SIGN_START.test(v)) {
    return `starts with "${v[0]}" directly followed by another character, which a spreadsheet could treat as a number or formula. Put a space after it, or reword it (for example write "Plus one" or put a letter first)`;
  }
  return null;
}

/** Trimmed, NFKC-folded, length-capped, safe plain text. */
export function safeText(what: string, max: number = LIMITS.maxNameLength) {
  return z
    .string({
      required_error: `${what} is required`,
      invalid_type_error: `${what} must be text`,
    })
    .trim()
    .min(1, `${what} must not be empty`)
    .max(max, `${what} must be at most ${max} characters`)
    .transform(normalizeText)
    .superRefine((value, ctx) => {
      if (value.length > max) {
        // Over the cap (or grew past it when folded). Skip the regexes.
        if (value.length <= max * 4) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} must be at most ${max} characters` });
        return;
      }
      const problem = textProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} ${problem}` });
    });
}

/** Trimmed email address that also passes the text safety rule. */
export function emailText(what: string) {
  const max = LIMITS.maxEmailLength;
  return z
    .string({
      required_error: `${what} is required`,
      invalid_type_error: `${what} must be text`,
    })
    .trim()
    .max(max, `${what} must be at most ${max} characters`)
    .transform(normalizeText)
    .superRefine((value, ctx) => {
      if (value.length > max) {
        if (value.length <= max * 4) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} must be at most ${max} characters` });
        return;
      }
      if (!EMAIL.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} must be a valid email address like name@example.com` });
        return;
      }
      const problem = textProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${what} ${problem}` });
    });
}

/** Names that would collide with object prototype members or the engine's own columns. */
const RESERVED_KEYS = new Set([
  "__proto__", "constructor", "prototype", "hasownproperty", "tostring", "valueof",
  "entry_id", "entered_by", "entered_at",
]);

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
    .regex(/^[a-z0-9_]+$/, `${what} must use only lowercase letters, numbers, and underscores (no spaces or capitals)`)
    .refine((v) => !RESERVED_KEYS.has(v.toLowerCase()), (v) => ({ message: `${what} "${show(v)}" is reserved by the system. Choose a different name` }));
}
