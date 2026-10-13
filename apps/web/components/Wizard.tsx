"use client";

import { useEffect, useRef, useState } from "react";
import type { Plan } from "@logwizard/plan-schema";
import personasJson from "@/data/personas.json";
import { CAPS } from "@/lib/caps";
import { BAD_KEY_FORMAT_MESSAGE, isValidKeyFormat, requestPlan } from "@/lib/client/api";
import { track } from "@/lib/client/track";
import { emptyAnswers, QUESTIONS, type Answers } from "@/lib/questions";
import { editedSample, withBrowserTimeZone } from "@/lib/wizard-logic";
import { DemoEnd } from "./DemoEnd";
import { PlanPreview } from "./PlanPreview";
import { button, cardClass, inputClass } from "./styles";

const PERSONAS = personasJson as Array<{ id: string; title: string; answers: Answers }>;

type Stage = "setup" | "question" | "working" | "followup" | "preview" | "done";
type PlanState = { plan: Plan; summary: string; unsupported: string[]; validation: "pass" | "retry_pass"; retries: number };

export function Wizard() {
  const [stage, setStage] = useState<Stage>("setup");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers());
  const [personaId, setPersonaId] = useState("");
  const [apiKey, setApiKey] = useState(""); // memory only: never written to storage, URL, or a cookie
  const [browserTz, setBrowserTz] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [followQs, setFollowQs] = useState<string[]>([]);
  const [followAs, setFollowAs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PlanState | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(0);

  const mode: "replay" | "byok" = apiKey.trim() ? "byok" : "replay";

  useEffect(() => {
    try {
      setBrowserTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setBrowserTz(undefined);
    }
  }, []);

  // Move focus to the heading whenever the screen changes, so keyboard and screen reader users land at the top.
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage, qIndex]);

  function choosePersona(id: string) {
    setPersonaId(id);
    const p = PERSONAS.find((x) => x.id === id);
    setAnswers(p ? { ...p.answers } : emptyAnswers());
  }

  function begin() {
    const key = apiKey.trim();
    if (key && !isValidKeyFormat(key)) {
      setError(BAD_KEY_FORMAT_MESSAGE);
      return;
    }
    setError("");
    track("interview_started", mode);
    started.current = Date.now();
    setAnswers((a) => withBrowserTimeZone(a, Boolean(personaId), browserTz));
    setQIndex(0);
    setStage("question");
  }

  async function submit(extraFollow?: Record<string, string>) {
    setError("");
    setStage("working");
    if (!extraFollow) track("interview_completed", mode, { duration_ms: Date.now() - started.current });
    track("plan_requested", mode);
    const t0 = Date.now();
    const res = await requestPlan({
      answers,
      browserTimeZone: browserTz,
      apiKey: apiKey.trim() || undefined,
      followUps: extraFollow,
      followUpsUsed: extraFollow ? Object.keys(extraFollow).length : 0,
    });
    if (!res.ok) {
      track("plan_validated", mode, { validation_result: "fail" });
      setError(res.message);
      setStage("question");
      setQIndex(QUESTIONS.length - 1);
      return;
    }
    track("plan_generated", mode, { duration_ms: Date.now() - t0 });
    track("plan_validated", mode, { validation_result: res.validation_result, retry_count: res.retry_count });
    if (!res.plan) {
      setFollowQs(res.follow_up_questions);
      setFollowAs({});
      setStage("followup");
      return;
    }
    setResult({ plan: res.plan, summary: res.summary ?? "", unsupported: res.unsupported_requests, validation: res.validation_result, retries: res.retry_count });
    track("preview_opened", mode);
    setStage("preview");
  }

  const q = QUESTIONS[qIndex]!;
  const answer = answers[q.key];
  const persona = PERSONAS.find((p) => p.id === personaId);
  const differsFromSample = editedSample(answers, persona?.answers);

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">
        {stage === "working" ? "Creating your plan. Please wait." : stage === "question" ? `Question ${qIndex + 1} of ${QUESTIONS.length}` : ""}
      </p>

      {stage === "setup" && (
        <section className={cardClass} aria-labelledby="setup-h">
          <h1 id="setup-h" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">Start the interview</h1>
          <p className="mt-2">Pick a sample person to see the demo, or paste your own AI key to answer for yourself.</p>

          <div className="mt-5">
            <label htmlFor="persona" className="block font-semibold">Sample person</label>
            <select id="persona" className={`${inputClass} mt-1`} value={personaId} onChange={(e) => choosePersona(e.target.value)}>
              <option value="">None (I will use my own key)</option>
              {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <p className="mt-1 text-sm text-slate-700">Choosing one fills in all ten answers. You can read and change them as you go.</p>
          </div>

          <div className="mt-5">
            <label htmlFor="key" className="block font-semibold">Your own AI key (optional)</label>
            <input
              id="key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} mt-1`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-describedby="key-help"
            />
            <p id="key-help" className="mt-1 text-sm text-slate-700">
              Stays in this page&apos;s memory only. It is sent with your plan request and never stored or logged. Reloading the page clears it.
              Leave empty to use recorded sample plans at no cost.
            </p>
          </div>

          {error && <p role="alert" className="mt-3 rounded border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
          <p className="mt-5 text-sm" aria-live="polite">
            {mode === "byok" ? "Mode: your own key. Your answers will be sent to the AI provider for one request." : persona ? "Mode: Demo (recorded plan, no AI call)." : "Choose a sample person or enter a key to continue."}
          </p>
          <div className="mt-4">
            <button type="button" className={button("primary")} onClick={begin} disabled={!persona && mode === "replay"}>Begin the interview</button>
          </div>
        </section>
      )}

      {stage === "question" && (
        <section className={cardClass} aria-labelledby="q-h">
          <p className="text-sm font-semibold" id="progress-label">Question {qIndex + 1} of {QUESTIONS.length}</p>
          <div
            role="progressbar"
            aria-labelledby="progress-label"
            aria-valuemin={1}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={qIndex + 1}
            className="mt-1 h-2 w-full rounded bg-slate-200"
          >
            <div className="h-2 rounded bg-blue-800" style={{ width: `${((qIndex + 1) / QUESTIONS.length) * 100}%` }} />
          </div>

          <h1 id="q-h" ref={headingRef} tabIndex={-1} className="mt-4 text-xl font-bold">
            <label htmlFor="answer">{q.label}</label>
          </h1>
          <p id="hint" className="mt-1 text-sm text-slate-700">{q.hint}</p>
          <textarea
            id="answer"
            rows={4}
            maxLength={CAPS.maxAnswerChars}
            className={`${inputClass} mt-3`}
            value={answer}
            onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
            aria-describedby="hint count"
          />
          <p id="count" className="mt-1 text-sm text-slate-700">{answer.length} of {CAPS.maxAnswerChars} characters</p>

          {error && <p role="alert" className="mt-3 rounded border border-red-700 bg-red-50 p-3 text-red-900">{error}</p>}
          {mode === "replay" && differsFromSample && (
            <p className="mt-3 rounded border border-amber-700 bg-amber-50 p-3 text-amber-900">
              You changed a sample answer. Demo mode can only replay the sample as written. Add your own AI key on the first screen to use edited answers.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className={button()} onClick={() => (qIndex === 0 ? setStage("setup") : setQIndex(qIndex - 1))}>Back</button>
            {qIndex < QUESTIONS.length - 1 ? (
              <>
                <button type="button" className={button("primary")} onClick={() => setQIndex(qIndex + 1)}>Next</button>
                <button type="button" className={button()} onClick={() => void submit()}>Skip to my plan</button>
              </>
            ) : (
              <button type="button" className={button("primary")} onClick={() => void submit()}>Create my plan</button>
            )}
          </div>
        </section>
      )}

      {stage === "working" && (
        <section className={cardClass} aria-labelledby="w-h">
          <h1 id="w-h" ref={headingRef} tabIndex={-1} className="text-xl font-bold">Creating your plan</h1>
          <p className="mt-2">Making the plan, then checking it against the rules. This takes a moment.</p>
        </section>
      )}

      {stage === "followup" && (
        <section className={cardClass} aria-labelledby="f-h">
          <h1 id="f-h" ref={headingRef} tabIndex={-1} className="text-xl font-bold">A couple more details</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(followAs);
            }}
            className="mt-3 space-y-4"
          >
            {followQs.map((fq, i) => (
              <div key={i}>
                <label htmlFor={`fu${i}`} className="block font-semibold">{fq}</label>
                <input id={`fu${i}`} className={`${inputClass} mt-1`} maxLength={CAPS.maxAnswerChars} value={followAs[fq] ?? ""} onChange={(e) => setFollowAs({ ...followAs, [fq]: e.target.value })} />
              </div>
            ))}
            <button type="submit" className={button("primary")}>Create my plan</button>
          </form>
        </section>
      )}

      {stage === "preview" && result && (
        <PlanPreview
          initialPlan={result.plan}
          initialSummary={result.summary}
          unsupported={result.unsupported}
          validation={result.validation}
          retries={result.retries}
          mode={mode}
          headingRef={headingRef}
          onApprove={(plan) => {
            track("plan_approved", mode);
            setResult({ ...result, plan });
            setStage("done");
          }}
        />
      )}

      {stage === "done" && result && <DemoEnd headingRef={headingRef} plan={result.plan} onRestart={() => { setStage("setup"); setResult(null); setError(""); }} />}
    </div>
  );
}
