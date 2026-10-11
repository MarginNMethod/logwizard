import { QUESTION_KEYS, type Answers } from "./questions";

/** Input caps (PLAN.md section 5). Applied on the server; the UI shows the same numbers. */
export const CAPS = {
  maxAnswerChars: 500,
  maxTotalChars: 4000,
  maxFollowUpAnswers: 2,
  maxTimeZoneChars: 64,
  planBodyBytes: 16 * 1024,
  validateBodyBytes: 96 * 1024,
  eventsBodyBytes: 2 * 1024,
} as const;

export type PlanRequest = {
  answers: Answers;
  browser_time_zone?: string;
  follow_ups_used: number;
  follow_up_answers: Record<string, string>;
};

export type CapsResult = { ok: true; value: PlanRequest } | { ok: false; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks a parsed /api/plan body. Unknown keys are dropped, never forwarded to the planner. */
export function checkPlanRequest(body: unknown): CapsResult {
  if (!isObj(body) || !isObj(body.answers)) return { ok: false, message: "Send an object with an answers property." };
  const answers = {} as Answers;
  let total = 0;
  for (const key of QUESTION_KEYS) {
    const v = body.answers[key];
    if (v === undefined || v === null) {
      answers[key] = "";
      continue;
    }
    if (typeof v !== "string") return { ok: false, message: "Every answer must be text." };
    if (v.length > CAPS.maxAnswerChars) return { ok: false, message: `Each answer can be at most ${CAPS.maxAnswerChars} characters.` };
    answers[key] = v;
    total += v.length;
  }

  const followUps: Record<string, string> = {};
  if (body.follow_up_answers !== undefined) {
    if (!isObj(body.follow_up_answers)) return { ok: false, message: "Follow-up answers must be an object." };
    const entries = Object.entries(body.follow_up_answers);
    if (entries.length > CAPS.maxFollowUpAnswers) return { ok: false, message: `At most ${CAPS.maxFollowUpAnswers} follow-up answers are allowed.` };
    for (const [q, a] of entries) {
      if (typeof a !== "string" || q.length > CAPS.maxAnswerChars || a.length > CAPS.maxAnswerChars) {
        return { ok: false, message: `Each follow-up question and answer can be at most ${CAPS.maxAnswerChars} characters.` };
      }
      followUps[q] = a;
      total += q.length + a.length;
    }
  }
  if (total > CAPS.maxTotalChars) return { ok: false, message: `All answers together can be at most ${CAPS.maxTotalChars} characters.` };

  let browser_time_zone: string | undefined;
  if (body.browser_time_zone !== undefined && body.browser_time_zone !== null) {
    if (typeof body.browser_time_zone !== "string" || body.browser_time_zone.length > CAPS.maxTimeZoneChars) {
      return { ok: false, message: "The browser time zone is not valid." };
    }
    browser_time_zone = body.browser_time_zone;
  }

  const used = body.follow_ups_used;
  const follow_ups_used = typeof used === "number" && Number.isInteger(used) && used >= 0 && used <= 2 ? used : 0;
  return { ok: true, value: { answers, browser_time_zone, follow_ups_used, follow_up_answers: followUps } };
}
