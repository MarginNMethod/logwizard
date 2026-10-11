// CLI: node --import ./src/register.mjs src/run.ts [--version v1] [--no-write] [--strict]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promptVersion, renderResults, runEval } from "./runner.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const vIdx = args.indexOf("--version");
const version = vIdx >= 0 && args[vIdx + 1] ? args[vIdx + 1]! : promptVersion(join(root, "planner-prompt.md"));

const report = runEval({ personasDir: join(root, "personas"), recordingsDir: join(root, "recordings"), version });
const md = renderResults(report);
if (!flag("--no-write")) writeFileSync(join(root, "results.md"), md);

const out = process.stdout;
out.write(`planner prompt ${version}: ${report.recorded} of ${report.total_personas} personas recorded\n`);
for (const r of report.results) {
  out.write(`  ${r.persona_id.padEnd(24)} ${r.status}${r.valid_on ? ` (valid on ${r.valid_on})` : ""}\n`);
  for (const f of r.flags) out.write(`      flag: ${f}\n`);
  for (const i of r.issues) out.write(`      ${i.kind}: ${i.feature}: ${i.detail}\n`);
}
if (report.graded > 0) {
  out.write(`first-try valid: ${report.first_try_valid}/${report.graded}; valid after retry: ${report.valid_after_retry}/${report.graded}; diff-clean: ${report.diff_clean}/${report.graded}; invented: ${report.invented_total}; missing: ${report.missing_total}\n`);
} else {
  out.write("no recordings to grade; no numbers claimed\n");
}
if (!flag("--no-write")) out.write("wrote evals/results.md\n");
if (flag("--strict") && report.results.some((r) => ["rejected", "invalid", "diff_fail"].includes(r.status))) process.exitCode = 1;
