// Eval runner core. Works only on recordings (files already on disk). It never calls an AI API
// and never reads an API key.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validatePlan } from "../../packages/plan-schema/src/index.ts";
import { diffPlan, type DiffIssue, type Persona, type PlannerReply } from "./diff.ts";

export const PRODUCED_BY = "Claude Code subagent run of evals/planner-prompt.md (no paid API call)";

export type Recording = {
  persona_id: string;
  produced_by: string;
  date: string;
  planner_prompt_version: string;
  raw_plan: PlannerReply;
  validation: { first_try_pass: boolean; retried: boolean; retry_pass: boolean | null };
  notes?: string;
  retry_plan?: PlannerReply;
  follow_up_answers?: Record<string, string>;
  tokens?: { input: number; output: number };
  duration_ms?: number;
};

export type Status =
  | "not_recorded" // no recording file for this persona and version
  | "rejected" // recording file is malformed or fails provenance checks; not graded
  | "invalid" // plan failed the schema validator even after retry (or no plan was produced)
  | "diff_fail" // plan valid but differs from expected
  | "pass"; // plan valid and no diff issues

export type PersonaResult = {
  persona_id: string;
  title: string;
  status: Status;
  /** Which validation path produced the graded plan. */
  valid_on: "first_try" | "retry" | "never" | null;
  issues: DiffIssue[];
  missing: string[];
  invented: string[];
  unrequested_fields: string[];
  flags: string[]; // recording-level problems (validation mismatch, rejected reasons)
  validator_errors: string[];
  recording_date: string | null;
  duration_ms: number | null;
  tokens: { input: number; output: number } | null;
};

export type Report = {
  prompt_version: string;
  results: PersonaResult[];
  total_personas: number;
  recorded: number; // graded or rejected recordings that exist
  graded: number; // recordings that were graded (not rejected)
  first_try_valid: number;
  valid_after_retry: number; // first-try valid plus valid on retry
  diff_clean: number;
  invented_total: number;
  missing_total: number;
};

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

export function promptVersion(promptFile: string): string {
  const m = /planner_prompt_version:\s*(\S+)/.exec(readFileSync(promptFile, "utf8"));
  if (!m) throw new Error(`no planner_prompt_version line in ${promptFile}`);
  return m[1]!;
}

export function loadPersonas(dir: string): Persona[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson(join(dir, f)) as Persona);
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isReply = (v: unknown): v is PlannerReply => isObj(v) && "plan" in v;

/** Structural checks on a recording file. Returns reasons it must be rejected (empty = ok). */
export function checkRecordingShape(rec: unknown, personaId: string, version: string): string[] {
  const why: string[] = [];
  if (!isObj(rec)) return ["recording is not a JSON object"];
  if (rec.produced_by !== PRODUCED_BY) why.push("produced_by is missing or not the required sentence");
  if (rec.persona_id !== personaId) why.push(`persona_id is ${JSON.stringify(rec.persona_id)}, expected ${personaId}`);
  if (rec.planner_prompt_version !== version) why.push(`planner_prompt_version is ${JSON.stringify(rec.planner_prompt_version)}, expected ${version}`);
  if (typeof rec.date !== "string") why.push("date is missing");
  if (!isReply(rec.raw_plan)) why.push("raw_plan is missing or has no plan key");
  const v = rec.validation;
  if (!isObj(v) || typeof v.first_try_pass !== "boolean" || typeof v.retried !== "boolean") why.push("validation block is missing or incomplete");
  return why;
}

function errorsOf(plan: unknown): string[] | null {
  const r = validatePlan(plan);
  return r.ok ? null : r.errors.map((e) => `${e.path}: ${e.message}`);
}

function blank(persona: Persona): PersonaResult {
  return {
    persona_id: persona.id,
    title: persona.title ?? persona.id,
    status: "not_recorded",
    valid_on: null,
    issues: [],
    missing: [],
    invented: [],
    unrequested_fields: [],
    flags: [],
    validator_errors: [],
    recording_date: null,
    duration_ms: null,
    tokens: null,
  };
}

export function evaluatePersona(persona: Persona, rec: unknown, version: string): PersonaResult {
  const res = blank(persona);
  const reasons = checkRecordingShape(rec, persona.id, version);
  if (reasons.length) {
    res.status = "rejected";
    res.flags = reasons;
    return res;
  }
  const r = rec as Recording;
  res.recording_date = r.date;
  res.duration_ms = typeof r.duration_ms === "number" ? r.duration_ms : null;
  res.tokens = r.tokens ?? null;

  // The runner recomputes validation and flags any mismatch with what the file claims.
  const firstErrors = r.raw_plan.plan === null ? ["plan is null (planner asked follow-up questions; the recording has no final plan)"] : errorsOf(r.raw_plan.plan);
  const firstOk = firstErrors === null;
  if (r.validation.first_try_pass !== firstOk) res.flags.push(`validation.first_try_pass is ${r.validation.first_try_pass} but the validator says ${firstOk}`);

  let graded: PlannerReply | null = null;
  let plan: unknown = null;
  if (firstOk) {
    res.valid_on = "first_try";
    graded = r.raw_plan;
    plan = r.raw_plan.plan;
    if (r.validation.retried || r.validation.retry_pass !== null) res.flags.push("first try passed but the file records a retry");
  } else {
    res.validator_errors = firstErrors!;
    if (!r.validation.retried) res.flags.push("first try failed but the file records no retry");
    if (r.retry_plan === undefined) {
      if (r.validation.retried) res.flags.push("validation.retried is true but retry_plan is missing");
      res.valid_on = "never";
    } else {
      const retryErrors = r.retry_plan.plan === null ? ["retry plan is null"] : errorsOf(r.retry_plan.plan);
      if (r.validation.retry_pass !== (retryErrors === null)) res.flags.push(`validation.retry_pass is ${r.validation.retry_pass} but the validator says ${retryErrors === null}`);
      if (retryErrors === null) {
        res.valid_on = "retry";
        graded = r.retry_plan;
        plan = r.retry_plan.plan;
      } else {
        res.valid_on = "never";
        res.validator_errors = retryErrors;
      }
    }
  }

  if (res.valid_on === "never") {
    res.status = "invalid";
    return res;
  }
  const diff = diffPlan(persona.expected, graded!, validatePlanOrThrow(plan));
  res.issues = diff.issues;
  res.unrequested_fields = diff.unrequested_fields;
  res.missing = diff.issues.filter((i) => i.kind === "missing").map((i) => `${i.feature}: ${i.detail}`);
  res.invented = diff.issues.filter((i) => i.kind === "invented").map((i) => `${i.feature}: ${i.detail}`);
  res.status = diff.issues.length === 0 ? "pass" : "diff_fail";
  return res;
}

function validatePlanOrThrow(plan: unknown): Record<string, any> {
  const r = validatePlan(plan);
  if (!r.ok) throw new Error("internal: plan should have been valid");
  return r.plan as unknown as Record<string, any>;
}

export function runEval(opts: { personasDir: string; recordingsDir: string; version: string }): Report {
  const personas = loadPersonas(opts.personasDir);
  const results: PersonaResult[] = personas.map((p) => {
    const file = join(opts.recordingsDir, `${p.id}.${opts.version}.json`);
    if (!existsSync(file)) return blank(p);
    let rec: unknown;
    try {
      rec = readJson(file);
    } catch (e) {
      const r = blank(p);
      r.status = "rejected";
      r.flags = [`recording is not valid JSON: ${(e as Error).message}`];
      return r;
    }
    return evaluatePersona(p, rec, opts.version);
  });
  const rec = results.filter((r) => r.status !== "not_recorded");
  const graded = rec.filter((r) => r.status !== "rejected");
  return {
    prompt_version: opts.version,
    results,
    total_personas: personas.length,
    recorded: rec.length,
    graded: graded.length,
    first_try_valid: graded.filter((r) => r.valid_on === "first_try").length,
    valid_after_retry: graded.filter((r) => r.valid_on === "first_try" || r.valid_on === "retry").length,
    diff_clean: graded.filter((r) => r.status === "pass").length,
    invented_total: graded.reduce((n, r) => n + r.invented.length, 0),
    missing_total: graded.reduce((n, r) => n + r.missing.length, 0),
  };
}

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ");

export function renderResults(report: Report): string {
  const L: string[] = [];
  const n = report.graded;
  L.push("# Eval results");
  L.push("");
  L.push(`Planner prompt version: ${report.prompt_version}`);
  L.push("");
  L.push("> **How these were produced.** Every recording graded here was produced by Claude Code subagents running `evals/planner-prompt.md` and the plan schema on Aaron's existing Claude Code plan. **No paid Anthropic API was called**, and these numbers are not API measurements. They describe the planner prompt and the plan schema. The runner reads recordings from disk only; it makes no network calls and needs no API key.");
  L.push("");
  L.push("## Summary");
  L.push("");
  L.push(`- Personas: ${report.total_personas}. Recorded: ${report.recorded}. Not recorded yet: ${report.total_personas - report.recorded}.`);
  if (n === 0) {
    L.push("- No recordings have been graded, so there are no pass counts. No number is claimed for personas without a recording.");
  } else {
    L.push(`- Valid on first try: ${report.first_try_valid} of ${n} recorded.`);
    L.push(`- Valid after one retry (includes first-try passes): ${report.valid_after_retry} of ${n} recorded.`);
    L.push(`- Matches expected with no diff issues: ${report.diff_clean} of ${n} recorded.`);
    L.push(`- Invented features: ${report.invented_total}. Missing features: ${report.missing_total}.`);
    L.push(`- The denominator is recorded personas only (${n}), not all ${report.total_personas}. Target (PLAN.md): all personas valid after one retry and zero invented features, which can be claimed only once every persona has a recording.`);
  }
  const rej = report.results.filter((r) => r.status === "rejected").length;
  if (rej) L.push(`- Rejected recordings (not graded): ${rej}. See the details below.`);
  L.push("");
  L.push("## Per persona");
  L.push("");
  L.push("| Persona | Result | Valid on | Missing | Invented | Notes |");
  L.push("|---|---|---|---|---|---|");
  const label: Record<string, string> = { not_recorded: "not recorded", rejected: "rejected", invalid: "invalid plan", diff_fail: "differs from expected", pass: "pass" };
  for (const r of report.results) {
    const validOn = r.valid_on === "first_try" ? "first try" : r.valid_on === "retry" ? "retry" : r.valid_on === "never" ? "never" : "-";
    const notes = [...r.flags, ...r.issues.filter((i) => !["missing", "invented"].includes(i.kind)).map((i) => `${i.kind}: ${i.feature} (${i.detail})`)];
    L.push(`| ${r.persona_id} | ${label[r.status]} | ${validOn} | ${r.missing.length ? cell(r.missing.join("; ")) : "-"} | ${r.invented.length ? cell(r.invented.join("; ")) : "-"} | ${notes.length ? cell(notes.join("; ")) : "-"} |`);
  }
  const bad = report.results.filter((r) => r.validator_errors.length);
  if (bad.length) {
    L.push("");
    L.push("## Validator errors");
    for (const r of bad) {
      L.push("");
      L.push(`**${r.persona_id}**`);
      for (const e of r.validator_errors.slice(0, 8)) L.push(`- ${cell(e)}`);
    }
  }
  const timed = report.results.filter((r) => r.duration_ms !== null || r.tokens);
  if (timed.length) {
    L.push("");
    L.push("## Time and tokens (where the run reported them)");
    L.push("");
    L.push("| Persona | Duration (ms) | Input tokens | Output tokens |");
    L.push("|---|---|---|---|");
    for (const r of timed) L.push(`| ${r.persona_id} | ${r.duration_ms ?? "-"} | ${r.tokens?.input ?? "-"} | ${r.tokens?.output ?? "-"} |`);
    L.push("");
    L.push("Cost is $0 by design (Claude Code plan, no paid API).");
  }
  const dates = report.results.map((r) => r.recording_date).filter((d): d is string => !!d).sort();
  L.push("");
  L.push("## Notes and limits");
  L.push("");
  if (dates.length) L.push(`- Recording dates: ${dates[0]} to ${dates[dates.length - 1]}.`);
  L.push("- The diff is mechanical (evals/README.md, Diff rules). It checks features, counts, days, time zone, required field labels, refusals, limits, forbidden strings, and formula or code artefacts. It cannot judge whether extra fields are sensible, so fields beyond the required labels are not counted as invented.");
  L.push("- The runner recomputes validation with the real validator and flags any recording whose recorded validation block disagrees.");
  L.push("- Each persona has one recording, so these results show what one run produced, not how often the prompt succeeds.");
  L.push("");
  return L.join("\n");
}
