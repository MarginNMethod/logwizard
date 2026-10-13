"use client";
import { useRef, useState } from "react";
import type { Plan } from "@logwizard/plan-schema";
import { planJsonForCopy } from "@/lib/plan-copy";
import { TEMPLATE_COPY_URL } from "@/lib/placeholders";
import { button, inputClass } from "./styles";

/** The copy link and paste plan setup: the app never writes to the user's Google account, the user does. */
export function BuildSteps({ plan }: { plan: Plan }) {
  const text = planJsonForCopy(plan);
  const [copied, setCopied] = useState(false);
  const [showBox, setShowBox] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setShowBox(false);
    } catch {
      // Clipboard blocked: show the plan in a box, selected, so the person can copy it by hand.
      setCopied(false);
      setShowBox(true);
      setTimeout(() => box.current?.select(), 0);
    }
  }

  const link = "text-blue-800 underline focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-800";
  return (
    <section className="mt-6" aria-labelledby="build-h">
      <h2 id="build-h" className="text-lg font-bold">Build it in your Google account</h2>
      <p className="mt-1 text-sm text-slate-700">LogWizard does not touch your Google account. You make a copy of a blank sheet and paste your plan into it.</p>
      <ol className="mt-3 list-decimal space-y-5 pl-6">
        <li>
          <strong>Make your copy.</strong> This copies a blank sheet with the LogWizard engine into your own Google Drive. Google will say
          the attached Apps Script is copied too. That is the engine.
          <div className="mt-2">
            <a className={button("primary")} href={TEMPLATE_COPY_URL} target="_blank" rel="noopener noreferrer">Make your copy (opens in a new tab)</a>
          </div>
        </li>
        <li>
          <strong>Copy your plan.</strong> This is the plan you just approved.
          <div className="mt-2">
            <button type="button" className={button()} onClick={() => void copy()}>Copy your plan</button>
            <span role="status" aria-live="polite" className="ml-3 font-semibold text-green-800">{copied ? "Copied" : ""}</span>
          </div>
          {showBox && (
            <div className="mt-2">
              <label htmlFor="plan-text" className="block text-sm font-semibold">Your browser blocked copying. Select all of this text and copy it yourself.</label>
              <textarea id="plan-text" ref={box} readOnly rows={8} className={`${inputClass} mt-1 font-mono text-sm`} value={text} onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
          <p className="mt-2 text-sm text-slate-700">You can also use Download plan as JSON on the review page and paste the file&apos;s text.</p>
        </li>
        <li>
          <strong>Paste it in the sheet.</strong> Open your copy and use the LogWizard menu, then Paste your plan. Paste, press Save, then reload
          the sheet and use the new menu, then Activate.
          <p className="mt-2 text-sm text-slate-700">
            The first time, Google shows a permission screen. The app is unverified while it is in testing, so Google adds a warning
            you must click through. It asks to: work with this spreadsheet, manage forms, send email as you, run on a schedule, and show
            sidebars and dialogs.
          </p>
        </li>
      </ol>
    </section>
  );
}
