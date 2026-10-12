import { describe, expect, it } from "vitest";
import { activate, addEntry, buildMenu, deliver, handleFormSubmission, hourlyTick, runRoutingNow, sendTestReminder, showSidebar, submitEntryFromSidebar, loadPlan, TRIGGER_INVENTORY } from "../src/core.js";
import { buildSidebarHtml } from "../src/sidebar.js";
import { FakeServices, makePlan } from "./fakeServices.js";

function activated(plan = makePlan()) {
  const svc = new FakeServices(plan);
  expect(activate(svc).ok).toBe(true);
  return svc;
}

const raw = { org_name: "Acme", interaction: "Email", date: "2026-03-01", area: ["Education", "Arts"], follow_up: "2026-03-02" };

function submission(over: Partial<{ responseId: string; email: string; answers: Record<string, string | string[]> }> = {}) {
  return {
    formId: "form-1",
    responseId: over.responseId ?? "r1",
    timestamp: "2026-03-01T14:00:00.000Z",
    email: over.email ?? "rep@example.com",
    answers: over.answers ?? {
      "Your name": "Sample Rep", Organization: "Acme", "Interaction type": "Email", Date: "2026-03-01",
      Area: ["Education", "Arts"], "Follow-up date": "2026-03-02",
    },
  };
}

describe("activate", () => {
  it("builds tabs, form, triggers, and the Setup confirmation", () => {
    const svc = activated();
    for (const t of ["Setup", "Activity", "All Employers", "Education Log", "Arts Log"]) expect(svc.tabs.has(t)).toBe(true);
    expect(svc.tabs.get("All Employers")![0]).toEqual(["Entry ID", "Entered by", "Entered at", "Organization", "Contact email", "Interaction type", "Date", "Area", "Follow-up date", "Notes"]);
    expect(svc.tz).toBe("America/Chicago");
    // one form for the one base log, with the fallback name question first
    expect(svc.forms).toHaveLength(1);
    expect(svc.forms[0]!.spec.items[0]).toMatchObject({ title: "Your name", required: true });
    expect(svc.forms[0]!.spec.items.map((i) => i.kind)).toContain("checkbox");
    // triggers from the named inventory
    expect(svc.triggers.map((t) => t.handler).sort()).toEqual(["hourlyTick", "onFormSubmit"]);
    // validation rules by field type: choice list, date, email
    const rules = svc.logTabSpecs.get("All Employers")!.rules;
    expect(rules.find((r) => r.kind === "list")?.options).toEqual(["Email", "Call", "Meeting", "Event"]);
    expect(rules.map((r) => r.kind).sort()).toEqual(["date", "date", "email", "list"]);
    // Setup confirms and shows the form link
    const setup = svc.tabs.get("Setup")!.flat().join(" ");
    expect(setup).toContain("https://forms.example.com/form-1");
    expect(setup).toContain("Activated at");
  });

  it("is idempotent: a second run adds no tabs, forms, or triggers", () => {
    const svc = activated();
    const tabs = [...svc.tabs.keys()].sort();
    const triggers = svc.triggers.length;
    expect(activate(svc).ok).toBe(true);
    expect([...svc.tabs.keys()].sort()).toEqual(tabs);
    expect(svc.forms).toHaveLength(1);
    expect(svc.triggers).toHaveLength(triggers);
  });

  it("removes only its own old triggers", () => {
    const svc = new FakeServices();
    svc.triggers.push({ id: "mine", handler: "hourlyTick", kind: "time" }, { id: "other", handler: "someoneElsesFunction", kind: "time" });
    activate(svc);
    expect(svc.triggers.find((t) => t.id === "mine")).toBeUndefined();
    expect(svc.triggers.find((t) => t.id === "other")).toBeDefined();
    expect(TRIGGER_INVENTORY.map((t) => t.name)).toEqual(["hourly", "form_submit"]);
  });

  it("never overwrites a tab with different headings", () => {
    const svc = new FakeServices();
    svc.tabs.set("All Employers", [["Mine", "Mine too"], ["keep", "me"]]);
    expect(activate(svc).ok).toBe(true);
    expect(svc.tabs.get("All Employers")).toEqual([["Mine", "Mine too"], ["keep", "me"]]);
    expect(svc.activity().some((r) => r[2]!.includes("left as it is"))).toBe(true);
  });

  it("refuses an invalid plan with a plain message and changes nothing", () => {
    const bad = { ...makePlan(), time_zone: "Mars/Olympus" };
    const svc = new FakeServices(JSON.stringify(bad));
    const r = activate(svc);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("time_zone");
    expect(svc.forms).toHaveLength(0);
    expect(svc.triggers).toHaveLength(0);
    expect(svc.tabs.has("All Employers")).toBe(false);
    expect(svc.activity()[0]![1]).toBe("error");
  });

  it("refuses a missing plan and non-JSON", () => {
    expect(activate(new FakeServices(null)).message).toContain("No plan");
    expect(activate(new FakeServices("{not json")).message).toContain("not valid JSON");
  });
});

describe("adding entries and routing", () => {
  it("form submit writes the row, routes copies, and alerts the owner about a contributor", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    expect(svc.readRows("All Employers")).toHaveLength(1);
    expect(svc.readRows("Education Log")).toHaveLength(1);
    expect(svc.readRows("Arts Log")).toHaveLength(1);
    expect(svc.readRows("All Employers")[0]![1]).toBe("rep@example.com");
    expect(svc.mails).toHaveLength(1);
    expect(svc.mails[0]!.to).toBe("owner@example.com");
    expect(svc.mails[0]!.body).toContain("Acme");
    expect(svc.lockCalls).toBeGreaterThan(0);
  });

  it("does not alert when the owner submits, and alerts for an unknown or missing email", () => {
    const svc = activated();
    handleFormSubmission(svc, submission({ responseId: "r2", email: "OWNER@example.com" }));
    expect(svc.mails).toHaveLength(0);
    handleFormSubmission(svc, submission({ responseId: "r3", email: "" }));
    expect(svc.mails).toHaveLength(1);
    expect(svc.readRows("All Employers")[1]![1]).toBe("Sample Rep");
  });

  it("a repeated form event (same response id) writes nothing twice", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    handleFormSubmission(svc, submission());
    expect(svc.readRows("All Employers")).toHaveLength(1);
    expect(svc.readRows("Education Log")).toHaveLength(1);
    expect(svc.mails).toHaveLength(1);
  });

  it("explains a bad answer on Activity and writes no row", () => {
    const svc = activated();
    const s = submission();
    s.answers.Date = "next tuesday";
    const r = handleFormSubmission(svc, s);
    expect(r.ok).toBe(false);
    expect(svc.readRows("All Employers")).toHaveLength(0);
    expect(svc.activity().at(-1)![2]).toContain("Date must be a date");
  });

  it("Run routing now fills missing copies once and never duplicates", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    // owner deletes the copies by hand (simulated), then routing restores them
    svc.tabs.set("Education Log", [svc.tabs.get("Education Log")![0]!]);
    expect(runRoutingNow(svc)).toContain("1 row(s) copied");
    expect(svc.readRows("Education Log")).toHaveLength(1);
    expect(runRoutingNow(svc)).toContain("0 row(s) copied");
    expect(svc.readRows("Education Log")).toHaveLength(1);
    expect(svc.readRows("Arts Log")).toHaveLength(1);
  });

  it("sanitizes every written value so formulas stay text", () => {
    const svc = activated();
    const r = addEntry(svc, loadOk(svc), {
      logId: "main", raw: { ...raw, org_name: '=HYPERLINK("http://x.example.com","hi")', notes: "-2+3", follow_up: "" },
      submitterEmail: "owner@example.com", submitterName: "", seed: "s1", submittedAt: "2026-03-01T14:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    // H2: real Google evaluates a leading "=" even in an "@" cell, so a protective apostrophe is written (options of strict list columns excepted).
    expect(svc.readRows("All Employers")[0]![3]).toBe("'=HYPERLINK(\"http://x.example.com\",\"hi\")");
    // a formula-like name in the Activity message is neutralised too
    expect(svc.activity().every((r) => !/^[=+\-@]/.test(r[2]!))).toBe(true);
  });

  it("unescapes stored values when reading back for routing", () => {
    const svc = activated();
    addEntry(svc, loadOk(svc), { logId: "main", raw: { ...raw, org_name: "=Acme" }, submitterEmail: "owner@example.com", submitterName: "", seed: "s2", submittedAt: "2026-03-01T14:00:00.000Z" });
    svc.tabs.set("Arts Log", [svc.tabs.get("Arts Log")![0]!]);
    runRoutingNow(svc);
    expect(svc.readRows("Arts Log")[0]![3]).toBe("'=Acme"); // read back strips the one apostrophe, the copy gets exactly one
  });
});

describe("sidebar", () => {
  it("shows the sidebar built from fields and escapes plan text", () => {
    const plan = makePlan();
    plan.logs[0]!.fields![0]!.label = "Org <b>&\"";
    const svc = new FakeServices(plan);
    showSidebar(svc);
    expect(svc.sidebars).toHaveLength(1);
    expect(svc.sidebars[0]!.html).toContain("Org &lt;b&gt;&amp;&quot;");
    expect(svc.sidebars[0]!.html).not.toContain("<b>&");
    expect(buildSidebarHtml(makePlan())).toContain('name="interaction"');
  });

  it("submitEntry returns plain errors for bad input and saves good input", () => {
    const svc = activated();
    const bad = submitEntryFromSidebar(svc, { logId: "main", values: { org_name: "" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain("Organization is required");
    expect(submitEntryFromSidebar(svc, "nope").ok).toBe(false);
    expect(submitEntryFromSidebar(svc, { logId: "education", values: raw }).ok).toBe(false);
    const good = submitEntryFromSidebar(svc, { logId: "main", values: raw });
    expect(good.ok).toBe(true);
    expect(svc.readRows("All Employers")).toHaveLength(1);
    // A4: a blank sidebar user is recorded as unknown (not assumed to be the owner), so the alert still goes out.
    expect(svc.mails).toHaveLength(1);
    svc.mails.length = 0;
    svc.user = "owner@example.com";
    submitEntryFromSidebar(svc, { logId: "main", values: { ...raw, org_name: "Gamma" } });
    expect(svc.mails).toHaveLength(0);
    svc.user = "rep@example.com";
    submitEntryFromSidebar(svc, { logId: "main", values: { ...raw, org_name: "Beta" } });
    expect(svc.mails).toHaveLength(1);
  });
});

describe("menu", () => {
  it("is named from the plan and lists the five actions", () => {
    const svc = new FakeServices();
    buildMenu(svc);
    expect(svc.menu!.name).toBe("Employer Outreach Log");
    expect(svc.menu!.items.filter((i) => i !== "separator").map((i) => (i as { label: string }).label)).toEqual(["Add entry", "Run routing now", "Send test reminder", "Activate", "Help"]);
    const none = new FakeServices(null);
    buildMenu(none);
    expect(none.menu!.name).toBe("LogWizard");
  });
});

function loadOk(svc: FakeServices) {
  const l = loadPlan(svc);
  if (!l.ok) throw new Error(l.message);
  return l.plan;
}

describe("hourlyTick", () => {
  function withFollowUp() {
    const svc = activated();
    handleFormSubmission(svc, submission()); // follow-up 2026-03-02, days_before 1 => due 2026-03-01
    svc.mails.length = 0;
    return svc;
  }

  it("sends a due reminder once and not again (sent keys)", () => {
    const svc = withFollowUp();
    expect(hourlyTick(svc)).toBe(1);
    expect(svc.mails).toHaveLength(1);
    expect(svc.mails[0]!.body).toContain("Acme");
    expect(hourlyTick(svc)).toBe(0);
    expect(svc.mails).toHaveLength(1);
    expect(svc.getProp("sent:2026-03-01")).toContain("followup|2026-03-01|owner@example.com");
  });

  it("waits until the send hour", () => {
    const svc = withFollowUp();
    svc.nowValue = new Date("2026-03-01T12:00:00Z"); // 06:00 Chicago
    expect(hourlyTick(svc)).toBe(0);
    svc.nowValue = new Date("2026-03-01T14:00:00Z"); // 08:00 Chicago, "at or past"
    expect(hourlyTick(svc)).toBe(1);
  });

  it("merges a reminder and the weekly digest into one email per person", () => {
    const svc = activated();
    handleFormSubmission(svc, { ...submission(), answers: { ...submission().answers, "Follow-up date": "2026-03-03" } });
    svc.mails.length = 0;
    svc.nowValue = new Date("2026-03-02T15:00:00Z"); // Monday 09:00 Chicago
    expect(hourlyTick(svc)).toBe(1);
    expect(svc.mails).toHaveLength(1);
    expect(svc.mails[0]!.body).toContain("Follow-ups due");
    expect(svc.mails[0]!.body).toContain("Weekly digest");
    expect(hourlyTick(svc)).toBe(0);
  });

  it("respects the daily cap and warns at 80%", () => {
    // A gmail.com owner is a personal account, so the cap is 100.
    const plan = makePlan({ owner: { name: "Sample Owner", email: "owner@gmail.com" }, contributors: [{ name: "Sample Rep", email: "rep@example.com", role: "contributor" }] });
    const p = new FakeServices(plan);
    activate(p);
    handleFormSubmission(p, submission());
    p.mails.length = 0;
    p.setProp("sendCount", JSON.stringify({ date: "2026-03-01", count: 100 }));
    expect(hourlyTick(p)).toBe(0);
    expect(p.mails).toHaveLength(0);
    expect(p.getProp("sent:2026-03-01")).toBeNull(); // not sent, so it will be retried
    expect(p.activity().at(-1)![2]).toContain("Daily email limit reached (100)");

    const q = new FakeServices(plan);
    activate(q);
    handleFormSubmission(q, submission());
    q.mails.length = 0;
    q.setProp("sendCount", JSON.stringify({ date: "2026-03-01", count: 79 }));
    expect(hourlyTick(q)).toBe(1);
    expect(JSON.parse(q.getProp("sendCount")!)).toEqual({ date: "2026-03-01", count: 80 });
    expect(q.activity().at(-1)![2]).toContain("80 of 100");
  });

  it("starts a new count on a new day and prunes old sent keys", () => {
    const svc = withFollowUp();
    svc.setProp("sendCount", JSON.stringify({ date: "2026-02-28", count: 99 }));
    svc.setProp("sent:2026-02-20", "[]");
    hourlyTick(svc);
    expect(JSON.parse(svc.getProp("sendCount")!).count).toBe(1);
    expect(svc.getProp("sent:2026-02-20")).toBeNull();
  });

  it("does not record keys or count a failed send, and logs it", () => {
    const svc = withFollowUp();
    svc.failMail = true;
    expect(hourlyTick(svc)).toBe(0);
    expect(svc.getProp("sent:2026-03-01")).toBeNull();
    expect(svc.activity().at(-1)![2]).toContain("could not be sent");
    svc.failMail = false;
    expect(hourlyTick(svc)).toBe(1);
  });

  it("stops with a message when the plan is invalid", () => {
    const svc = new FakeServices("{}");
    expect(hourlyTick(svc)).toBe(0);
    expect(svc.mails).toHaveLength(0);
    expect(svc.activity()[0]![2]).toContain("hourly check stopped");
  });
});

describe("sendTestReminder", () => {
  it("ignores the send hour, goes to the owner, and records no keys", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    svc.mails.length = 0;
    svc.nowValue = new Date("2026-03-01T12:00:00Z"); // 06:00, before send_hour 8
    sendTestReminder(svc);
    expect(svc.mails).toHaveLength(1);
    expect(svc.mails[0]!.to).toBe("owner@example.com");
    expect(svc.mails[0]!.subject).toContain("[Test]");
    expect(svc.mails[0]!.body).toContain("Acme");
    expect(svc.getProp("sent:2026-03-01")).toBeNull();
  });

  it("still sends a short test email when nothing is due", () => {
    const svc = activated();
    sendTestReminder(svc);
    expect(svc.mails[0]!.body).toContain("No follow-ups are due today");
  });
});

describe("deliver", () => {
  it("sends one email per person even if given duplicates in different case", () => {
    const svc = activated();
    const plan = loadOk(svc);
    const n = deliver(svc, plan, [
      { to: "A@example.com", subject: "s", body: "b", keys: [] },
      { to: "a@example.com", subject: "s", body: "b", keys: [] },
    ]);
    expect(n).toBe(1);
  });
});
