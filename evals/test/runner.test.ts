// Uses TEST FIXTURES under test/fixtures (hand-written fake personas and recordings, not real ones).
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PRODUCED_BY, checkRecordingShape, envelopeErrorsOf, evaluatePersona, loadPersonas, promptVersion, renderResults, runEval } from "../src/runner.ts";

const fx = join(import.meta.dirname, "fixtures");
const report = runEval({ personasDir: join(fx, "personas"), recordingsDir: join(fx, "recordings"), version: "v1" });
const by = (id: string) => report.results.find((r) => r.persona_id === id)!;

describe("runEval on test fixtures", () => {
  it("grades a first-try pass", () => {
    expect(by("fx-first-try")).toMatchObject({ status: "pass", valid_on: "first_try", issues: [], flags: [], duration_ms: 1234 });
  });

  it("grades a retry pass and records the first-try validator errors", () => {
    const r = by("fx-retry");
    expect(r).toMatchObject({ status: "pass", valid_on: "retry", flags: [] });
  });

  it("marks a plan that never validates as invalid", () => {
    const r = by("fx-never-valid");
    expect(r.status).toBe("invalid");
    expect(r.valid_on).toBe("never");
    expect(r.validator_errors.length).toBeGreaterThan(0);
  });

  it("rejects a recording with the wrong produced_by and does not grade it", () => {
    const r = by("fx-bad-provenance");
    expect(r.status).toBe("rejected");
    expect(r.flags[0]).toContain("produced_by");
    expect(r.valid_on).toBeNull();
  });

  it("reports a persona with no recording as not recorded, with no result claimed", () => {
    expect(by("fx-norecord")).toMatchObject({ status: "not_recorded", valid_on: null, issues: [], missing: [], invented: [] });
  });

  it("flags a recording whose validation block disagrees with the real validator", () => {
    const r = by("fx-mismatch");
    expect(r.status).toBe("pass");
    expect(r.flags.join(" ")).toContain("first_try_pass");
  });

  it("counts only recorded personas in the totals", () => {
    expect(report.total_personas).toBe(6);
    expect(report.recorded).toBe(5);
    expect(report.graded).toBe(4);
    expect(report.first_try_valid).toBe(2); // first-try and mismatch
    expect(report.valid_after_retry).toBe(3);
    expect(report.diff_clean).toBe(3);
    expect(report.invented_total).toBe(0);
  });
});

describe("renderResults", () => {
  const md = renderResults(report);
  it("labels how recordings were produced and says no paid API", () => {
    expect(md).toContain("Claude Code subagents");
    expect(md).toContain("No paid Anthropic API was called");
  });
  it("has a not recorded row and uses recorded counts as the denominator", () => {
    expect(md).toMatch(/\| fx-norecord \| not recorded \|/);
    expect(md).toContain("Valid on first try: 2 of 4 recorded");
  });
  it("contains no em dashes", () => {
    expect(md.includes(String.fromCharCode(0x2014))).toBe(false);
  });
  it("claims no numbers when nothing is recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "evals-empty-"));
    mkdirSync(join(dir, "rec"));
    const empty = runEval({ personasDir: join(fx, "personas"), recordingsDir: join(dir, "rec"), version: "v1" });
    expect(empty.recorded).toBe(0);
    const text = renderResults(empty);
    expect(text).toContain("No recordings have been graded");
    expect(text).not.toMatch(/of 0 recorded/);
    expect(text).not.toContain("Valid on first try");
  });
});

describe("checkRecordingShape and evaluatePersona", () => {
  const persona = loadPersonas(join(fx, "personas")).find((p) => p.id === "fx-first-try")!;
  const good = () => ({
    persona_id: "fx-first-try", produced_by: PRODUCED_BY, date: "2000-01-01", planner_prompt_version: "v1",
    raw_plan: { plan: null, follow_up_questions: [], unsupported_requests: [] },
    validation: { first_try_pass: false, retried: false, retry_pass: null },
  });

  it("accepts a well-formed file and rejects wrong id, version, or missing fields", () => {
    expect(checkRecordingShape(good(), "fx-first-try", "v1")).toEqual([]);
    expect(checkRecordingShape({ ...good(), persona_id: "other" }, "fx-first-try", "v1")).toHaveLength(1);
    expect(checkRecordingShape({ ...good(), planner_prompt_version: "v2" }, "fx-first-try", "v1")).toHaveLength(1);
    expect(checkRecordingShape({ ...good(), validation: undefined }, "fx-first-try", "v1")).toHaveLength(1);
    expect(checkRecordingShape("nope", "fx-first-try", "v1")).toHaveLength(1);
  });

  it("a null plan (follow-up questions only) is invalid, not graded as a pass", () => {
    const r = evaluatePersona(persona, good(), "v1");
    expect(r.status).toBe("invalid");
    expect(r.flags.join(" ")).toContain("no retry");
  });

  it("writes and reads a recording from disk end to end", () => {
    const dir = mkdtempSync(join(tmpdir(), "evals-rec-"));
    writeFileSync(join(dir, "fx-first-try.v1.json"), "{ not json");
    const r = runEval({ personasDir: join(fx, "personas"), recordingsDir: dir, version: "v1" });
    expect(r.results.find((x) => x.persona_id === "fx-first-try")!.status).toBe("rejected");
  });
});

describe("reply envelope check", () => {
  const persona = loadPersonas(join(fx, "personas")).find((p) => p.id === "fx-first-try")!;
  const base = JSON.parse(readFileSync(join(fx, "recordings", "fx-first-try.v1.json"), "utf8"));
  const longNote = "x".repeat(150) + " and then some more words to push it past the cap " + "y".repeat(40); // > 200 chars
  const withNotes = (notes: string[], questions: string[] = []) => ({
    ...base,
    raw_plan: { ...base.raw_plan, unsupported_requests: notes, follow_up_questions: questions },
  });

  it("a fake recording with an over-length note is valid as a plan but fails the envelope check", () => {
    expect(longNote.length).toBeGreaterThan(200);
    const r = evaluatePersona(persona, withNotes([longNote]), "v1");
    expect(r.valid_on).toBe("first_try");
    expect(r.status).toBe("pass");
    expect(r.envelope_errors.length).toBe(1);
    expect(r.envelope_errors[0]).toContain("unsupported_requests");
  });

  it("a clean recording has no envelope errors, and too many follow-up questions fail", () => {
    expect(evaluatePersona(persona, base, "v1").envelope_errors).toEqual([]);
    expect(envelopeErrorsOf({ plan: base.raw_plan.plan, follow_up_questions: ["a", "b", "c"], unsupported_requests: [] }).length).toBeGreaterThan(0);
  });

  it("plan-level validation errors are not counted as envelope errors", () => {
    expect(envelopeErrorsOf({ plan: { schema_version: 1 }, follow_up_questions: [], unsupported_requests: [] })).toEqual([]);
  });

  it("the results table shows the envelope column and a separate envelope failure count", () => {
    const dir = mkdtempSync(join(tmpdir(), "evals-env-"));
    writeFileSync(join(dir, "fx-first-try.v1.json"), JSON.stringify(withNotes([longNote])));
    const rep = runEval({ personasDir: join(fx, "personas"), recordingsDir: dir, version: "v1" });
    expect(rep.envelope_failures).toBe(1);
    const md = renderResults(rep);
    expect(md).toContain("| Envelope |");
    expect(md).toMatch(/\| fx-first-try \| pass \| first try \| FAIL \|/);
    expect(md).toContain("## Envelope failures");
    expect(md).toContain("0 of 1 recorded pass. 1 fail.");
  });
});

describe("--version smoke test", () => {
  it("reports not recorded for every persona when a version has no recordings, without error", () => {
    const personasDir = join(import.meta.dirname, "..", "personas");
    const rep = runEval({ personasDir, recordingsDir: join(import.meta.dirname, "..", "recordings"), version: "v99" });
    expect(rep.total_personas).toBe(12);
    expect(rep.results.filter((r) => r.status === "not_recorded")).toHaveLength(12);
    expect(rep.recorded).toBe(0);
    expect(renderResults(rep)).not.toMatch(/of 0 recorded/);
  });

  it("the v1 and v2 prompt files carry their own versions", () => {
    expect(promptVersion(join(import.meta.dirname, "..", "planner-prompt.md"))).toBe("v1");
    expect(promptVersion(join(import.meta.dirname, "..", "planner-prompt.v2.md"))).toBe("v2");
  });
});
