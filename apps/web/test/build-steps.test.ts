import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validatePlan } from "@logwizard/plan-schema";
import { BuildSteps } from "../components/BuildSteps";
import { DemoEnd } from "../components/DemoEnd";
import { planJsonForCopy } from "../lib/plan-copy";
import { TEMPLATE_COPY_URL } from "../lib/placeholders";
import { RECORDINGS } from "../data/recordings";

const sample = validatePlan(((RECORDINGS[0] as unknown as { raw_plan: unknown }).raw_plan as { plan: unknown }).plan);
if (!sample.ok) throw new Error("sample recording should be valid");
const plan = sample.plan;

describe("copy link and paste plan", () => {
  it("points at the Google copy URL of the template", () => {
    expect(TEMPLATE_COPY_URL).toBe("https://docs.google.com/spreadsheets/d/1nHHw39TFnycPiG9SorKBwRziUoucHR6AXOQkWMYVx5M/copy");
    const u = new URL(TEMPLATE_COPY_URL);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("docs.google.com");
    expect(u.pathname.endsWith("/copy")).toBe(true);
  });

  it("offers exactly the approved plan for copying, and it validates", () => {
    const text = planJsonForCopy(plan);
    expect(JSON.parse(text)).toEqual(plan);
    expect(validatePlan(JSON.parse(text)).ok).toBe(true);
  });

  it("renders the three numbered steps with a safe new-tab link", () => {
    const html = renderToStaticMarkup(createElement(BuildSteps, { plan }));
    expect(html).toContain("Build it in your Google account");
    expect(html).toContain("<ol");
    for (const t of ["Make your copy", "Copy your plan", "Paste it in the sheet"]) expect(html).toContain(t);
    expect(html).toContain(`href="${TEMPLATE_COPY_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Paste your plan");
    expect(html).toContain("unverified");
  });

  it("shows the steps on the page after approval, and says nothing was built", () => {
    const html = renderToStaticMarkup(createElement(DemoEnd, { headingRef: { current: null }, plan, onRestart: () => {} }));
    expect(html).toContain("Build it in your Google account");
    expect(html).toContain("nothing is built");
    expect(html).not.toContain("\u2014");
  });
});
