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

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "logwizard-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Clear the message so a second copy is announced again.
      setTimeout(() => setCopied(false), 3000);
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
          <div className="mt-2">
            <button type="button" className={button()} onClick={download}>Download plan as a file</button>
          </div>
          <p className="mt-2 text-sm text-slate-700">If copying does not work, use the download and open the file in a text editor, then copy its text.</p>
        </li>
        <li>
          <strong>Paste it in the sheet.</strong> Open your copy and use the LogWizard menu, then Paste your plan. Press Check plan, read the
          list of people who will be emailed, then press Save this plan. Reload the sheet, then use the new menu and choose Activate.
          <p className="mt-2 text-sm text-slate-700">
            Use a private window, or a browser signed in to only one Google account. With two accounts signed in, Google can refuse
            the Save button with a permission error.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            The first time, Google shows a permission screen and an unverified-app warning. Click Advanced, then Go to the app (unsafe).
            Google then lists what the sheet may do. These are the five items, in Google&apos;s words:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-700">
            <li>View and manage spreadsheets that this application has been installed in. (The sheet only, not your other sheets.)</li>
            <li>View and manage your forms in Google Drive. (The entry form the sheet creates.)</li>
            <li>Send email as you. (Reminders and alerts, to the people listed in the plan.)</li>
            <li>Allow this application to run when you are not present. (The hourly reminder check.)</li>
            <li>Display and run third-party web content in prompts and sidebars inside Google applications. (The Add entry panel.)</li>
          </ul>
          <p className="mt-2 text-sm font-semibold text-slate-800">Safety checks</p>
          <ul className="mt-1 list-disc space-y-1 pl-6 text-sm text-slate-700">
            <li>Only use the Make your copy button on this page. Do not use a copy link someone else sent you.</li>
            <li>Only paste a plan made on this page. A plan from someone else can add people who will be emailed your entries. Check the list before you save.</li>
          </ul>
        </li>
      </ol>
    </section>
  );
}
