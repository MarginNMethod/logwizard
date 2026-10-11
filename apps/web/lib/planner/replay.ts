import recordedPersonas from "../../data/personas.json";
import { RECORDINGS } from "../../data/recordings";
import { QUESTION_KEYS, type Answers } from "../questions";
import { PlannerError, type PlannerProvider } from "./types";

type Recording = {
  persona_id: string;
  raw_plan: unknown;
  retry_plan?: unknown;
  validation: { first_try_pass: boolean; retried: boolean; retry_pass: boolean | null };
};

export type SamplePersona = { id: string; title: string; answers: Answers };

export const SAMPLE_PERSONAS = recordedPersonas as SamplePersona[];

const recordings = RECORDINGS as Recording[];

const same = (a: Answers, b: Answers) => QUESTION_KEYS.every((k) => (a[k] ?? "").trim() === (b[k] ?? "").trim());

/** Finds the recording whose persona answers match exactly (ignoring outer whitespace). */
export function findRecording(answers: Answers): Recording | null {
  const persona = SAMPLE_PERSONAS.find((p) => same(p.answers, answers));
  if (!persona) return null;
  return recordings.find((r) => r.persona_id === persona.id) ?? null;
}

const MAX_NOTE = 200;
const clip = (v: unknown): unknown => (typeof v === "string" && v.length > MAX_NOTE ? `${v.slice(0, MAX_NOTE - 3)}...` : v);

/**
 * Recordings are fixed files and are never edited. The reply envelope caps notes at 200 characters,
 * and at least one recording (forty-fields) has a longer note, so notes are clipped on the way out.
 */
function clipNotes(reply: unknown): unknown {
  if (typeof reply !== "object" || reply === null) return reply;
  const r = reply as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(clip) : v);
  return { ...r, unsupported_requests: list(r.unsupported_requests), follow_up_questions: list(r.follow_up_questions) };
}

export function createReplayProvider(answers: Answers): PlannerProvider {
  const recording = findRecording(answers);
  if (!recording) {
    throw new PlannerError(
      "replay_no_match",
      "Demo mode can only replay the sample personas. Pick a sample, or add your own AI key to use your own answers.",
      422,
    );
  }
  return {
    mode: "replay",
    async generate({ validation_errors }) {
      // First call: the recorded reply. Retry call: the recorded retry reply when there is one.
      if (validation_errors && recording.retry_plan) return clipNotes(recording.retry_plan);
      return clipNotes(recording.raw_plan);
    },
  };
}
