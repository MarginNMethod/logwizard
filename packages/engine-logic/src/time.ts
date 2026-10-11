// Time zone helpers. The ONLY place that touches Intl.
//
// Apps Script note: the V8 runtime ships Intl.DateTimeFormat, but historically
// its time zone support has been uneven. If `zonedParts` misbehaves there, the
// engine can replace it with Utilities.formatDate(date, tz, "yyyy-MM-dd HH u")
// and feed the same ZonedParts shape. Everything else here is plain calendar
// arithmetic on "YYYY-MM-DD" strings and does not need Intl.

export type DayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface ZonedParts {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Local hour 0 to 23. */
  hour: number;
  day: DayCode;
}

const DAY_CODES: Record<string, DayCode> = {
  Mon: "MON", Tue: "TUE", Wed: "WED", Thu: "THU", Fri: "FRI", Sat: "SAT", Sun: "SUN",
};

export function zonedParts(now: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    day: DAY_CODES[p.weekday ?? ""] ?? "MON",
  };
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in "YYYY-MM-DD" form. */
export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Add whole days to an ISO date. Pure calendar math, so DST cannot shift it. */
export function addDays(iso: string, n: number): string {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return t.toISOString().slice(0, 10);
}

/** Whole days from a to b (b minus a). */
export function daysBetween(a: string, b: string): number {
  const ma = ISO.exec(a);
  const mb = ISO.exec(b);
  if (!ma || !mb) throw new Error(`Not an ISO date: ${a} or ${b}`);
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((tb - ta) / 86400000);
}
