import type { RefObject } from "react";
import Link from "next/link";
import { SAMPLE_SHEET_URL, WALKTHROUGH_URL } from "@/lib/placeholders";
import { button, cardClass } from "./styles";

function PlaceholderLink({ href, label, note }: { href: string | null; label: string; note: string }) {
  if (href) return <a className="text-blue-800 underline" href={href} rel="noopener noreferrer" target="_blank">{label}</a>;
  return (
    <span>
      <strong>{label}</strong>{" "}
      <span className="rounded border border-amber-700 bg-amber-50 px-1 text-amber-900">PLACEHOLDER: {note}</span>
    </span>
  );
}

export function DemoEnd({ headingRef, systemName, onRestart }: { headingRef: RefObject<HTMLHeadingElement | null>; systemName: string; onRestart: () => void }) {
  return (
    <section className={cardClass} aria-labelledby="end-h">
      <h1 id="end-h" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">Your plan for &quot;{systemName}&quot; is approved (Demo mode)</h1>
      <p className="mt-3">
        In Demo mode nothing is built in a Google account and no one signed in. In the full version, the next step builds the
        spreadsheet, the entry form, and the reminders in your own Google account.
      </p>
      <h2 className="mt-5 text-lg font-bold">See what the result looks like</h2>
      <ul className="mt-2 list-disc space-y-2 pl-6">
        <li>
          <PlaceholderLink href={SAMPLE_SHEET_URL} label="View-only sample sheet" note="link to be added once the sample sheet is published" />
        </li>
        <li>
          <PlaceholderLink href={WALKTHROUGH_URL} label="Recorded walkthrough of Activate and reminders" note="link to be added once the walkthrough is recorded" />
        </li>
      </ul>
      <p className="mt-4 text-sm text-slate-700">Nothing from this session was saved on our server. See the <Link href="/privacy" className="text-blue-800 underline">privacy notice</Link>.</p>
      <div className="mt-5">
        <button type="button" className={button("primary")} onClick={onRestart}>Start over</button>
      </div>
    </section>
  );
}
