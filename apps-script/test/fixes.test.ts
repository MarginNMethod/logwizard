import { describe, expect, it } from "vitest";
import { activate, addEntry, deliver, guarded, handleFormSubmission, hourlyTick, loadPlan, rowToEntry, sendTestReminder, submitEntryFromSidebar } from "../src/core.js";
import { buildSidebarHtml } from "../src/sidebar.js";
import { FakeServices, makePlan } from "./fakeServices.js";
import type { Plan } from "@logwizard/engine-logic";

const gmailPlan = () => makePlan({ owner: { name: "Sample Owner", email: "owner@gmail.com" }, contributors: [{ name: "Sample Rep", email: "rep@example.com", role: "contributor" }] });

function activated(plan: Plan = makePlan()) {
  const svc = new FakeServices(plan);
  expect(activate(svc).ok).toBe(true);
  return svc;
}

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

const plainPlan = (svc: FakeServices) => {
  const l = loadPlan(svc);
  if (!l.ok) throw new Error(l.message);
  return l.plan;
};
const col = (svc: FakeServices, tab: string, header: string) => svc.tabs.get(tab)![0]!.indexOf(header);
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ to: `a${i}@example.com`, subject: "s", body: "b", keys: [] as string[] }));

describe("A1 re-activate after a plan edit", () => {
  it("appends a field added at the end to the headings and keeps data in place", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    const v2 = makePlan();
    v2.logs[0]!.fields!.push({ key: "region", label: "Region", type: "text", required: false });
    svc.setPlan(v2);
    expect(activate(svc).ok).toBe(true);
    const head = svc.tabs.get("All Employers")![0]!;
    expect(head.at(-1)).toBe("Region");
    expect(svc.tabs.get("Education Log")![0]!.at(-1)).toBe("Region");
    expect(svc.readRows("All Employers")[0]![3]).toBe("Acme");
    expect(svc.forms[0]!.spec.items.map((i) => i.title)).toContain("Region");
    handleFormSubmission(svc, { ...submission({ responseId: "r2" }), answers: { ...submission().answers, Region: "West" } });
    const row = svc.readRows("All Employers")[1]!;
    expect(row[head.indexOf("Region")]).toBe("West");
    expect(row[head.indexOf("Organization")]).toBe("Acme");
  });

  it("stops that log when a field is inserted in the middle, says what differs, and writes nothing against it", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    const before = JSON.stringify(svc.tabs.get("All Employers"));
    const v2 = makePlan();
    v2.logs[0]!.fields!.splice(1, 0, { key: "contact_name", label: "Contact name", type: "text", required: false });
    svc.setPlan(v2);
    const triggersBefore = svc.triggers.length;
    const r = activate(svc);
    expect(r.ok).toBe(true);
    expect(svc.tabs.get("All Employers")!.map((x) => x.length)).toEqual(JSON.parse(before).map((x: string[]) => x.length));
    expect(JSON.stringify(svc.tabs.get("All Employers"))).toBe(before);
    expect(svc.forms[0]!.spec.items.map((i) => i.title)).not.toContain("Contact name");
    expect(svc.triggers.filter((t) => t.kind === "form")).toHaveLength(0);
    expect(svc.triggers.length).toBeLessThan(triggersBefore);
    const msg = svc.activity().map((a) => a[2]).join("\n");
    expect(msg).toContain("All Employers");
    expect(msg).toContain("Contact name");
    expect(msg.toLowerCase()).toContain("rename");
    // a later submission is refused instead of landing in shifted columns
    const res = handleFormSubmission(svc, { ...submission({ responseId: "r9" }), answers: { ...submission().answers, "Contact name": "Pat" } });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(svc.tabs.get("All Employers"))).toBe(before);
    expect(() => hourlyTick(svc)).not.toThrow();
  });

  it("writes and reads by heading name, so a hand-reordered tab keeps data in the right column", () => {
    const svc = activated();
    const t = svc.tabs.get("All Employers")!;
    const a = col(svc, "All Employers", "Organization");
    const b = col(svc, "All Employers", "Contact email");
    [t[0]![a], t[0]![b]] = [t[0]![b]!, t[0]![a]!];
    handleFormSubmission(svc, submission());
    const row = svc.readRows("All Employers")[0]!;
    expect(row[col(svc, "All Employers", "Organization")]).toBe("Acme");
    const entry = rowToEntry(plainPlan(svc), "main", row, svc.readHeaders("All Employers")!);
    expect(entry.values.org_name).toBe("Acme");
  });
});

describe("A2 locking around sends", () => {
  function due() {
    const svc = activated();
    handleFormSubmission(svc, submission());
    svc.mails.length = 0;
    return svc;
  }

  it("does not hold the lock while mail is being sent", () => {
    const svc = due();
    let during = "";
    svc.onSend = () => {
      during = handleFormSubmission(svc, submission({ responseId: "during" })).ok ? "recorded" : "refused";
    };
    expect(hourlyTick(svc)).toBe(1);
    expect(during).toBe("recorded");
    expect(svc.readRows("All Employers")).toHaveLength(2);
  });

  it("retries a busy lock a few times before giving up", () => {
    const svc = activated();
    svc.lockFailures = 2;
    expect(handleFormSubmission(svc, submission()).ok).toBe(true);
    expect(svc.readRows("All Employers")).toHaveLength(1);
  });

  it("imports form responses the trigger missed, once, with their alert", () => {
    const svc = activated();
    const lost = submission({ responseId: "lost" });
    lost.timestamp = "2026-03-01T15:30:00.000Z";
    svc.responses.set("form-1", [lost]);
    svc.nowValue = new Date("2026-03-01T16:00:00Z");
    hourlyTick(svc);
    expect(svc.readRows("All Employers")).toHaveLength(1);
    expect(svc.mails.filter((m) => m.subject.includes("new entry"))).toHaveLength(1);
    hourlyTick(svc);
    expect(svc.readRows("All Employers")).toHaveLength(1);
    expect(svc.mails.filter((m) => m.subject.includes("new entry"))).toHaveLength(1);
  });

  it("does not import responses older than the first activation", () => {
    const svc = activated();
    const old = submission({ responseId: "old" });
    old.timestamp = "2026-01-01T00:00:00.000Z";
    svc.responses.set("form-1", [old]);
    hourlyTick(svc);
    expect(svc.readRows("All Employers")).toHaveLength(0);
  });

  it("activate holds the lock for the form and trigger section", () => {
    const svc = new FakeServices();
    activate(svc);
    expect(svc.lockCalls).toBeGreaterThan(0);
  });
});

describe("A3 daily count under concurrency", () => {
  it("reserves before sending and keeps a send that happens during another send", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    svc.mails.length = 0;
    svc.props.delete("sendCount");
    let reservedDuring = -1;
    svc.onSend = () => {
      reservedDuring = JSON.parse(svc.getProp("sendCount")!).count;
      handleFormSubmission(svc, submission({ responseId: "during" }));
    };
    hourlyTick(svc);
    expect(reservedDuring).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(svc.getProp("sendCount")!)).toEqual({ date: "2026-03-01", count: 2 });
  });

  it("gives back the reservation for a failed send", () => {
    const svc = activated();
    handleFormSubmission(svc, submission());
    svc.props.delete("sendCount");
    svc.failMail = true;
    hourlyTick(svc);
    const c = svc.getProp("sendCount");
    expect(c === null || JSON.parse(c).count === 0).toBe(true);
  });

  it("counts a test reminder through the same accounting", () => {
    const svc = activated();
    sendTestReminder(svc);
    expect(JSON.parse(svc.getProp("sendCount")!).count).toBe(1);
  });
});

describe("A4 sidebar user", () => {
  it("records unknown and still alerts when Google gives no email", () => {
    const svc = activated();
    svc.user = "";
    expect(submitEntryFromSidebar(svc, { logId: "main", values: { org_name: "Acme", interaction: "Email", date: "2026-03-01", area: ["Arts"] } }).ok).toBe(true);
    expect(svc.readRows("All Employers")[0]![1]).toBe("unknown");
    expect(svc.mails).toHaveLength(1);
  });
});

describe("A5 quota ceiling", () => {
  it("never sends more than MailApp says is left", () => {
    const svc = activated();
    svc.quota = 5;
    expect(deliver(svc, plainPlan(svc), items(8))).toBe(5);
  });
  it("counts what was already used today as part of the ceiling", () => {
    const svc = activated();
    svc.setProp("sendCount", JSON.stringify({ date: "2026-03-01", count: 10 }));
    svc.quota = 5;
    expect(deliver(svc, plainPlan(svc), items(8))).toBe(5);
    svc.quota = 0;
    expect(deliver(svc, plainPlan(svc), items(3))).toBe(0);
  });
});

describe("A6 alert budget", () => {
  it("caps alerts per hour", () => {
    const svc = activated(gmailPlan());
    const plan = plainPlan(svc);
    expect(deliver(svc, plan, items(30), "alert")).toBe(10);
    expect(deliver(svc, plan, items(5), "alert")).toBe(0);
    expect(svc.activity().some((a) => a[2]!.toLowerCase().includes("alert"))).toBe(true);
  });
  it("caps alerts at half the daily limit and leaves room for reminders", () => {
    const svc = activated(gmailPlan());
    const plan = plainPlan(svc);
    let sent = 0;
    for (let h = 0; h < 8; h++) {
      svc.nowValue = new Date(svc.nowValue.getTime() + 3600_000);
      sent += deliver(svc, plan, items(20).map((i) => ({ ...i, to: `h${h}${i.to}` })), "alert");
    }
    expect(sent).toBe(50);
    expect(deliver(svc, plan, [{ to: "owner@gmail.com", subject: "s", body: "b", keys: [] }])).toBe(1);
  });
});

describe("A7 form items are refreshed on every activation", () => {
  it("updates options and required flags of existing questions", () => {
    const svc = activated();
    const v2 = makePlan();
    v2.logs[0]!.fields![2]!.options = ["Email", "Call", "Meeting", "Event", "Webinar"];
    v2.logs[0]!.fields![5]!.required = true;
    svc.setPlan(v2);
    activate(svc);
    const items2 = svc.forms[0]!.spec.items;
    expect(items2.find((i) => i.title === "Interaction type")!.options).toContain("Webinar");
    expect(items2.find((i) => i.title === "Follow-up date")!.required).toBe(true);
    expect(svc.activity().some((a) => a[2]!.includes("Interaction type"))).toBe(true);
  });
});

describe("A8 hand-typed dates", () => {
  function withRow(cell: string) {
    const svc = activated();
    handleFormSubmission(svc, submission({ answers: { ...submission().answers, "Follow-up date": "2026-03-02" } }));
    svc.mails.length = 0;
    svc.tabs.get("All Employers")![1]![col(svc, "All Employers", "Follow-up date")] = cell;
    return svc;
  }
  it("reads 3/2/2026 as a date", () => {
    expect(hourlyTick(withRow("3/2/2026"))).toBe(1);
  });
  it("warns about an unreadable date and does not send for it", () => {
    const svc = withRow("soon");
    expect(hourlyTick(svc)).toBe(0);
    expect(svc.activity().some((a) => a[1] === "warning" && a[2]!.includes("date"))).toBe(true);
  });
});

describe("A9 busy detection", () => {
  it("treats only Lock timeout as busy and words trigger runs differently", () => {
    const svc = activated();
    guarded(svc, "Form submit", () => { throw new Error("Lock timeout: another process was holding the lock for too long."); }, false);
    expect(svc.activity().at(-1)![2]).toContain("skipped");
    guarded(svc, "Hourly check", () => { throw new Error("Cannot lock the cell range"); }, false);
    expect(svc.activity().at(-1)![2]).toContain("did not finish");
    guarded(svc, "Add entry", () => { throw new Error("Lock timeout: x"); });
    expect(svc.alerts.at(-1)!.message).toContain("try again in a minute");
  });
});

describe("A11 name question never collides with a plan label", () => {
  it("uses a different title and keeps the two answers apart", () => {
    const plan = makePlan();
    plan.logs[0]!.fields!.push({ key: "your_name", label: "Your name", type: "text", required: false });
    const svc = activated(plan);
    const titles = svc.forms[0]!.spec.items.map((i) => i.title);
    const nameTitle = titles[0]!;
    expect(nameTitle.toLowerCase()).not.toBe("your name");
    expect(titles.filter((t) => t.toLowerCase() === "your name")).toHaveLength(1);
    handleFormSubmission(svc, { ...submission({ email: "" }), answers: { ...submission().answers, [nameTitle]: "Sample Rep", "Your name": "Org Contact" } });
    const head = svc.tabs.get("All Employers")![0]!;
    const row = svc.readRows("All Employers")[0]!;
    expect(row[head.indexOf("Your name")]).toBe("Org Contact");
    expect(row[1]).toBe("Sample Rep");
  });
});

describe("A12 contributor-supplied name", () => {
  it("is cleaned, capped, kept out of the subject, and quoted in the body", () => {
    const svc = activated();
    const nasty = "Eve\nBcc: x@evil.example " + "z".repeat(200);
    handleFormSubmission(svc, { ...submission({ email: "" }), answers: { ...submission().answers, "Your name": nasty } });
    const by = svc.readRows("All Employers")[0]![1]!;
    expect(by.length).toBeLessThanOrEqual(80);
    expect(by).not.toContain("\n");
    const mail = svc.mails[0]!;
    expect(mail.subject).not.toContain("Eve");
    expect(mail.body).toContain(`"${by}"`);
  });
});

describe("A13 sidebar accessibility", () => {
  it("pairs labels and controls, groups checkboxes, and flags required fields", () => {
    const html = buildSidebarHtml(makePlan());
    expect(html).toContain('for="f_main_org_name"');
    expect(html).toContain('id="f_main_org_name"');
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('for="logpick"'.replace("logpick", "f_main_interaction"));
  });
});

describe("Q2 text cells", () => {
  it("protects formula-looking text with one apostrophe, leaves a list option raw, and reads both back", () => {
    const plan = makePlan();
    plan.logs[0]!.fields![2]!.options = ["Email", "Call", "Meeting", "Event", "- Other -"];
    const svc = activated(plan);
    handleFormSubmission(svc, { ...submission(), answers: { ...submission().answers, Organization: "=SUM(A1)", "Interaction type": "- Other -" } });
    const head = svc.tabs.get("All Employers")![0]!;
    const row = svc.readRows("All Employers")[0]!;
    // old expectation (raw "=SUM(A1)") was the H2 bug: real Google evaluates it even in an "@" cell
    expect(row[head.indexOf("Organization")]).toBe("'=SUM(A1)");
    expect(row[head.indexOf("Interaction type")]).toBe("- Other -");
    const rule = svc.logTabSpecs.get("All Employers")!.rules.find((r) => r.kind === "list" && r.column === head.indexOf("Interaction type") + 1)!;
    expect(rule.options).toContain(row[head.indexOf("Interaction type")]);
    expect(rowToEntry(plainPlan(svc), "main", row, head).values.org_name).toBe("=SUM(A1)");
    // routed copy is protected the same way, with no doubled apostrophe
    expect(svc.readRows("Education Log")[0]![head.indexOf("Organization")]).toBe("'=SUM(A1)");
    // Activity stays neutralised
    expect(svc.activity().every((r) => !/^[=+\-@]/.test(r[2]!))).toBe(true);
  });
});

describe("Q3 verified email", () => {
  it("never treats an unverified form email as the owner", () => {
    const svc = new FakeServices();
    svc.verifiedEmail = false;
    activate(svc);
    expect(svc.activity().some((a) => a[1] === "warning" && a[2]!.toLowerCase().includes("verif"))).toBe(true);
    handleFormSubmission(svc, submission({ email: "owner@example.com" }));
    expect(svc.mails).toHaveLength(1);
    expect(svc.readRows("All Employers")[0]![1]).toContain("unverified");
  });
  it("still skips the alert for a verified owner email", () => {
    const svc = activated();
    handleFormSubmission(svc, submission({ email: "owner@example.com" }));
    expect(svc.mails).toHaveLength(0);
  });
});
