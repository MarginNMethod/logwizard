"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Plan, PlanError, PlanField } from "@logwizard/plan-schema";
import { requestValidate } from "@/lib/client/api";
import { track } from "@/lib/client/track";
import { button, cardClass, inputClass } from "./styles";

type Props = {
  initialPlan: Plan;
  initialSummary: string;
  unsupported: string[];
  validation: "pass" | "retry_pass";
  retries: number;
  mode: "replay" | "byok";
  headingRef: RefObject<HTMLHeadingElement | null>;
  onApprove: (plan: Plan) => void;
};

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const DAY_WORDS: Record<string, string> = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };
const hourWords = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

function OptionsEditor({ field, onChange }: { field: PlanField; onChange: (options: string[]) => void }) {
  // Local text so Enter and trailing spaces work while typing; the plan gets the parsed list.
  const [text, setText] = useState((field.options ?? []).join("\n"));
  const id = `opt-${field.key}-${Math.abs(hash(field.key + (field.label ?? "")))}`;
  return (
    <div className="mt-2">
      <label htmlFor={id} className="block text-sm font-semibold">Options for &quot;{field.label}&quot; (one per line)</label>
      <textarea
        id={id}
        rows={Math.min(8, Math.max(3, (field.options ?? []).length + 1))}
        className={`${inputClass} mt-1`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean));
        }}
      />
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function PlanPreview({ initialPlan, initialSummary, unsupported, validation, retries, mode, headingRef, onApprove }: Props) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [lastValid, setLastValid] = useState<Plan>(initialPlan);
  const [summary, setSummary] = useState(initialSummary);
  const [errors, setErrors] = useState<PlanError[]>([]);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);
  const edited = useRef(false);

  // Re-validate through the server after each edit (debounced). No AI call.
  useEffect(() => {
    if (!edited.current) return;
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      const res = await requestValidate(plan);
      if (mine !== seq.current) return; // a newer edit superseded this check
      setChecking(false);
      if (res.ok) {
        setErrors([]);
        setSummary(res.summary);
        setLastValid(res.plan);
        track("preview_edited", mode, { validation_result: "pass" });
      } else {
        setErrors(res.errors);
        track("preview_edited", mode, { validation_result: "fail" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [plan, mode]);

  function edit(mutate: (draft: Plan) => void) {
    edited.current = true;
    setPlan((cur) => {
      const draft = structuredClone(cur);
      mutate(draft);
      return draft;
    });
  }

  const valid = errors.length === 0 && !checking;

  function download() {
    const blob = new Blob([JSON.stringify(lastValid, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(lastValid.system_name || "plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track("plan_downloaded", mode);
  }

  return (
    <div className="space-y-5">
      <section className={cardClass} aria-labelledby="prev-h">
        <h1 id="prev-h" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">Review your plan</h1>
        <p className="mt-1 text-sm text-slate-700">
          Check result: {validation === "pass" ? "passed on the first try" : `passed after ${retries} retry`}. Nothing is built until you approve.
        </p>
        <div className="mt-3 whitespace-pre-wrap rounded border border-slate-300 bg-slate-50 p-4" data-testid="summary">{summary}</div>
      </section>

      <section className={cardClass} aria-labelledby="unsup-h">
        <h2 id="unsup-h" className="text-lg font-bold">Things I left out</h2>
        {unsupported.length === 0 ? (
          <p className="mt-2">Nothing was left out.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-6">{unsupported.map((u, i) => <li key={i}>{u}</li>)}</ul>
        )}
      </section>

      <section className={cardClass} aria-labelledby="edit-h">
        <h2 id="edit-h" className="text-lg font-bold">Edit your plan</h2>
        <p className="mt-1 text-sm text-slate-700">Each change is checked again right away. If you rename an option that is used for copying entries, the check will tell you.</p>

        <div role="status" aria-live="polite" className="mt-3" data-testid="status">
          {checking && <p>Checking your changes...</p>}
          {!checking && errors.length === 0 && edited.current && <p className="text-green-900">Your plan passes all checks.</p>}
        </div>
        {errors.length > 0 && !checking && (
          <div role="alert" className="mt-2 rounded border border-red-700 bg-red-50 p-3 text-red-900">
            <p className="font-semibold">Fix {errors.length === 1 ? "this problem" : "these problems"} to continue. The summary above shows your last passing version.</p>
            <ul className="mt-1 list-disc pl-6">{errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
          </div>
        )}

        {plan.logs.map((log, li) =>
          log.fields ? (
            <fieldset key={log.id} className="mt-5 rounded border border-slate-300 p-4">
              <legend className="px-2 font-bold">{log.name}: fields</legend>
              {log.fields.map((f, fi) => (
                <div key={f.key} className="mb-4">
                  <label htmlFor={`label-${log.id}-${f.key}`} className="block text-sm font-semibold">Label for the {f.type.replace("_", " ")} field &quot;{f.key}&quot;</label>
                  <input
                    id={`label-${log.id}-${f.key}`}
                    className={`${inputClass} mt-1`}
                    value={f.label}
                    maxLength={200}
                    onChange={(e) => edit((d) => { const df = d.logs[li]?.fields?.[fi]; if (df) df.label = e.target.value; })}
                  />
                  {(f.type === "choice" || f.type === "multi_choice") && (
                    <OptionsEditor field={f} onChange={(options) => edit((d) => { const df = d.logs[li]?.fields?.[fi]; if (df) df.options = options; })} />
                  )}
                </div>
              ))}
            </fieldset>
          ) : null,
        )}

        {plan.reminders.length > 0 && (
          <fieldset className="mt-5 rounded border border-slate-300 p-4">
            <legend className="px-2 font-bold">Reminders</legend>
            {plan.reminders.map((r, ri) => (
              <div key={ri} className="mb-4 flex flex-wrap items-end gap-4">
                <p className="w-full font-semibold">{r.type === "weekly_digest" ? "Weekly summary email" : "Follow-up reminder"}</p>
                {r.type === "weekly_digest" ? (
                  <div>
                    <label htmlFor={`day-${ri}`} className="block text-sm font-semibold">Day of the week</label>
                    <select id={`day-${ri}`} className={`${inputClass} mt-1`} value={r.day} onChange={(e) => edit((d) => { const dr = d.reminders[ri]; if (dr?.type === "weekly_digest") dr.day = e.target.value as (typeof DAYS)[number]; })}>
                      {DAYS.map((d) => <option key={d} value={d}>{DAY_WORDS[d]}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label htmlFor={`days-${ri}`} className="block text-sm font-semibold">Days before the follow-up date (0 to 30)</label>
                    <input
                      id={`days-${ri}`}
                      type="number"
                      min={0}
                      max={30}
                      className={`${inputClass} mt-1`}
                      value={r.days_before}
                      onChange={(e) => edit((d) => { const dr = d.reminders[ri]; if (dr?.type === "follow_up_due") dr.days_before = Number(e.target.value); })}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor={`hour-${ri}`} className="block text-sm font-semibold">Time to send</label>
                  <select id={`hour-${ri}`} className={`${inputClass} mt-1`} value={r.send_hour} onChange={(e) => edit((d) => { const dr = d.reminders[ri]; if (dr) dr.send_hour = Number(e.target.value); })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourWords(h)}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </fieldset>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" className={button()} onClick={download} disabled={!valid}>Download plan as JSON</button>
        <button type="button" className={button("primary")} onClick={() => onApprove(lastValid)} disabled={!valid}>Approve and finish demo</button>
      </div>
    </div>
  );
}
