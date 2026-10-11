// Helper for people (or subagents) making a recording: run the real validator on a planner reply.
// Usage: node --import ./src/register.mjs src/validate-reply.ts path/to/reply.json
// The file holds the planner's reply object: { "plan": ..., "follow_up_questions": [...], "unsupported_requests": [...] }.
// Prints VALID, or INVALID plus the plain-language errors to paste into the retry message as `validation_errors`.
import { readFileSync } from "node:fs";
import { validatePlan } from "../../packages/plan-schema/src/index.ts";

const file = process.argv[2];
if (!file) {
  process.stdout.write("usage: validate-reply.ts <reply.json>\n");
  process.exitCode = 2;
} else {
  const reply = JSON.parse(readFileSync(file, "utf8"));
  if (!reply || typeof reply !== "object" || !("plan" in reply)) {
    process.stdout.write("INVALID\nThe reply must be an object with a plan key.\n");
    process.exitCode = 1;
  } else if (reply.plan === null) {
    process.stdout.write("INVALID\nplan is null (the planner asked follow-up questions). Give scripted answers and run it again.\n");
    process.exitCode = 1;
  } else {
    const r = validatePlan(reply.plan);
    if (r.ok) process.stdout.write("VALID\n");
    else {
      process.stdout.write("INVALID\n");
      for (const e of r.errors) process.stdout.write(`${e.path}: ${e.message}\n`);
      process.exitCode = 1;
    }
  }
}
