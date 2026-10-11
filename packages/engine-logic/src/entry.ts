import type { Plan, PlanField, Entry, EntryValue } from "./types.js";
import { logFields } from "./types.js";
import { isIsoDate } from "./time.js";

/**
 * Deterministic entry id. No randomness inside: the caller supplies `seed`
 * (for example a form response id, or Utilities.getUuid() output) and the
 * submission instant. Same inputs always give the same id, which is what makes
 * re-running routing idempotent.
 */
export function makeEntryId(input: { seed: string; logId: string; submittedAt: string }): string {
  const s = `${input.logId}\u0001${input.submittedAt}\u0001${input.seed}`;
  // cyrb53 hash, two passes with different seeds for ~106 bits of spread. Not cryptographic.
  const h = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  };
  return `e_${h(0)}${h(7)}`;
}

/**
 * Force a value to plain text that cannot run as a spreadsheet formula.
 *
 * Rule: after any leading whitespace, if the first character is one of
 * = + - @ (or the string starts with a tab or carriage return), prefix a single
 * apostrophe. In Google Sheets a leading apostrophe marks the cell as literal
 * text and is not displayed. The engine should ALSO set the range number
 * format to "@" (plain text) before writing, as a second layer.
 *
 * Finite numbers become their plain decimal string with no prefix (a negative
 * number is not a formula). Control characters other than tab/newline are removed.
 */
export function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  let s = Array.isArray(value) ? value.map(String).join(", ") : String(value);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const first = s.replace(/^[  ]+/, "").charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || s.charAt(0) === "\t" || s.charAt(0) === "\r") {
    return `'${s}`;
  }
  return s;
}

export type NormResult<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  // eslint-disable-next-line no-control-regex
  return String(raw).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function normDate(s: string): string | null {
  if (isIsoDate(s)) return s;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const iso = `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
    if (isIsoDate(iso)) return iso;
  }
  return null;
}

function matchOption(options: readonly string[], s: string): string | undefined {
  const l = s.toLowerCase();
  return options.find((o) => o.toLowerCase() === l);
}

/** Normalise one raw value for one field. Empty optional values become "" (or [] for multi_choice). */
export function normaliseValue(field: PlanField, raw: unknown): NormResult<EntryValue> {
  const label = field.label;
  const multi = field.type === "multi_choice";
  const parts: string[] = Array.isArray(raw) ? raw.map(clean).filter(Boolean) : [];
  const text = Array.isArray(raw) ? parts.join(",") : clean(raw);
  const empty = multi ? parts.length === 0 && text === "" : text === "";

  if (empty) {
    return field.required ? { ok: false, error: `${label} is required` } : { ok: true, value: multi ? [] : "" };
  }

  switch (field.type) {
    case "text":
    case "long_text":
      return { ok: true, value: text };
    case "email": {
      const e = text.toLowerCase();
      return EMAIL.test(e) ? { ok: true, value: e } : { ok: false, error: `${label} must be an email address` };
    }
    case "date": {
      const d = normDate(text);
      return d ? { ok: true, value: d } : { ok: false, error: `${label} must be a date like 2026-03-01` };
    }
    case "choice": {
      const o = matchOption(field.options ?? [], text);
      return o ? { ok: true, value: o } : { ok: false, error: `${label} must be one of: ${(field.options ?? []).join(", ")}` };
    }
    case "multi_choice": {
      const opts = field.options ?? [];
      // An array is taken as-is. A string is tried whole first (an option may contain a comma), then split on commas.
      const items = Array.isArray(raw) ? parts : matchOption(opts, text) ? [text] : text.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const out: string[] = [];
      for (const it of items) {
        const o = matchOption(opts, it);
        if (!o) return { ok: false, error: `${label} has an unknown choice "${it}". Choose from: ${opts.join(", ")}` };
        if (!out.includes(o)) out.push(o);
      }
      return { ok: true, value: out };
    }
    case "yes_no": {
      const l = text.toLowerCase();
      if (["yes", "y", "true", "1"].includes(l)) return { ok: true, value: "Yes" };
      if (["no", "n", "false", "0"].includes(l)) return { ok: true, value: "No" };
      return { ok: false, error: `${label} must be Yes or No` };
    }
    case "number": {
      const n = Number(text.replace(/,/g, ""));
      return text !== "" && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `${label} must be a number` };
    }
    case "phone": {
      const digits = text.replace(/\D/g, "");
      return /^[0-9+()\-.\s]+$/.test(text) && digits.length >= 7 && digits.length <= 15
        ? { ok: true, value: text }
        : { ok: false, error: `${label} must be a phone number` };
    }
    case "url": {
      return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(text) ? { ok: true, value: text } : { ok: false, error: `${label} must be a web address starting with http:// or https://` };
    }
    default:
      return { ok: false, error: `${label} has an unsupported type` };
  }
}

export type EntryResult =
  | { ok: true; values: Record<string, EntryValue> }
  | { ok: false; errors: string[] };

/** Normalise a whole raw submission (keyed by field key) against a log's fields. Unknown keys are dropped. */
export function normaliseEntry(plan: Plan, logId: string, raw: Record<string, unknown>): EntryResult {
  const values: Record<string, EntryValue> = {};
  const errors: string[] = [];
  for (const f of logFields(plan, logId)) {
    const r = normaliseValue(f, raw[f.key]);
    if (r.ok) values[f.key] = r.value;
    else errors.push(r.error);
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/** Header row for a log tab: meta columns first, then the field labels. */
export const META_HEADERS = ["Entry ID", "Entered by", "Entered at"] as const;

export function headersForLog(plan: Plan, logId: string): string[] {
  return [...META_HEADERS, ...logFields(plan, logId).map((f) => f.label)];
}

/** Sanitised cells for one row, in header order. Every cell is safe to write as plain text. */
export function entryToCells(plan: Plan, logId: string, entry: Entry): string[] {
  return [
    sanitizeCellValue(entry.id),
    sanitizeCellValue(entry.enteredBy),
    sanitizeCellValue(entry.enteredAt ?? ""),
    ...logFields(plan, logId).map((f) => sanitizeCellValue(entry.values[f.key])),
  ];
}
