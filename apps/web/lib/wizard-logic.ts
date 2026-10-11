import { QUESTIONS, type Answers } from "./questions";

/**
 * Pre-fills the time zone question from the browser, but only when no sample person is chosen.
 * A sample person's own answer (even an empty one) must be left alone so it still matches its recording.
 */
export function withBrowserTimeZone(answers: Answers, personaChosen: boolean, browserTz: string | undefined): Answers {
  if (personaChosen || answers.q10_time_zone || !browserTz) return answers;
  return { ...answers, q10_time_zone: browserTz };
}

/** True only when the visitor actually changed a sample answer (outer whitespace ignored). */
export function editedSample(answers: Answers, sample: Answers | undefined): boolean {
  if (!sample) return false;
  return QUESTIONS.some((q) => (answers[q.key] ?? "").trim() !== (sample[q.key] ?? "").trim());
}

/** Keeps the raw text so an emptied box stays empty. An empty or non-numeric box sends null, which the validator reports. */
export function parseDaysBefore(raw: string): number | null {
  const t = raw.trim();
  if (t === "" || !Number.isFinite(Number(t))) return null;
  return Number(t);
}
