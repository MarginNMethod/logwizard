import Link from "next/link";
import { button } from "@/components/styles";

export default function Landing() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="h">
        <h1 id="h" className="text-3xl font-bold">Set up an interaction log by answering ten questions</h1>
        <p className="mt-3">
          LogWizard interviews you in plain language, turns your answers into a setup plan, and shows you that plan in
          plain English before anything is built. You can edit it, check it, and download it.
        </p>
        <p className="mt-4">
          <Link href="/start" className={button("primary")}>Try Demo mode</Link>
        </p>
      </section>

      <section aria-labelledby="demo">
        <h2 id="demo" className="text-xl font-bold">Demo mode: no sign-in, no cost</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>Pick a sample person, such as a career center or a church volunteer coordinator. The interview fills in.</li>
          <li>Watch the plan appear, get checked, and open for editing. Editing and checking work live.</li>
          <li>Finish with a view-only sample sheet and a short recorded walkthrough.</li>
          <li>Nothing is saved on our server. The sample plans are recorded, so no AI service is contacted.</li>
        </ul>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="text-xl font-bold">How it stays safe</h2>
        <p className="mt-2">
          The AI only writes a plan. It never writes code that runs in your account. Every plan is checked against strict
          rules and shown to you for approval first. Your answers are treated as untrusted text.
        </p>
      </section>

      <section aria-labelledby="own">
        <h2 id="own" className="text-xl font-bold">Want to try your own answers?</h2>
        <p className="mt-2">
          You can paste your own Anthropic API key in the interview. It stays in your browser&apos;s memory, is sent only with
          the request, and is never stored or logged. See the <Link href="/privacy" className="text-blue-800 underline">privacy notice</Link>.
        </p>
      </section>
    </div>
  );
}
