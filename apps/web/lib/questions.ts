// The 10 interview questions (PLAN.md section 5). Keys match evals/personas and evals/planner-prompt.md.
export const QUESTIONS = [
  { key: "q1_interaction_kinds", label: "What kind of interactions do you want to track?", hint: "For example employers, clients, students, donors, vendors." },
  { key: "q2_system_name", label: "What should we call this system?", hint: "Leave blank and we will suggest a name." },
  { key: "q3_details", label: "What details do you record for each interaction?", hint: "List them, for example: organization name, contact email, date, notes." },
  { key: "q4_areas", label: "Do you sort entries into areas, teams, or categories? What are they?", hint: "Leave blank if you do not." },
  { key: "q5_multi_area_copy", label: "Should an entry tagged with more than one area appear in each of those areas' own logs?", hint: "Yes or no is fine." },
  { key: "q6_contributors", label: "Who else will add entries?", hint: "Names and email addresses. Leave blank if it is only you." },
  { key: "q7_contributor_alert", label: "Do you want an email when someone else adds an entry?", hint: "Yes or no is fine." },
  { key: "q8_follow_up", label: "Do you track follow-up dates? How many days ahead do you want a reminder?", hint: "For example: yes, remind me 1 day before." },
  { key: "q9_weekly_digest", label: "Would you like a weekly summary email? Which day and time?", hint: "For example: Monday at 8am." },
  { key: "q10_time_zone", label: "What time zone are you in?", hint: "We pre-fill this from your browser. Change it if needed." },
] as const;

export type AnswerKey = (typeof QUESTIONS)[number]["key"];
export const QUESTION_KEYS: readonly AnswerKey[] = QUESTIONS.map((q) => q.key);
export type Answers = Record<AnswerKey, string>;

export function emptyAnswers(): Answers {
  return Object.fromEntries(QUESTION_KEYS.map((k) => [k, ""])) as Answers;
}
