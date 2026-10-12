// Post-build checks on dist/Code.js. Exits non-zero on failure.
import { readFileSync, statSync } from "node:fs";

const code = readFileSync("dist/Code.js", "utf8");
const manifest = JSON.parse(readFileSync("dist/appsscript.json", "utf8"));
const problems = [];

if (/^\s*import[\s{*"']/m.test(code)) problems.push("dist/Code.js has an import statement");
if (/^\s*export[\s{*]/m.test(code)) problems.push("dist/Code.js has an export statement");
if (/\brequire\s*\(/.test(code)) problems.push("dist/Code.js calls require()");
for (const n of ["onOpen", "activate", "showAddEntrySidebar", "submitEntry", "onFormSubmit", "runRoutingNow", "sendTestReminder", "hourlyTick", "showHelp"]) {
  if (!new RegExp(`^function ${n}\\(`, "m").test(code)) problems.push(`missing top-level function ${n}`);
}
const ALLOWED = new Set([
  "https://www.googleapis.com/auth/spreadsheets.currentonly",
  "https://www.googleapis.com/auth/forms",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/script.send_mail",
  "https://www.googleapis.com/auth/script.container.ui",
  "https://www.googleapis.com/auth/userinfo.email",
]);
for (const s of manifest.oauthScopes ?? []) if (!ALLOWED.has(s)) problems.push(`unexpected OAuth scope ${s}`);
if (manifest.runtimeVersion !== "V8") problems.push("runtimeVersion must be V8");

const kb = (statSync("dist/Code.js").size / 1024).toFixed(1);
const zod = /ZodError|ZodType|ZodObject/.test(code);
console.log(`Bundle size: ${kb} KB`);
console.log(`zod bundled: ${zod ? "YES (validatePlan pulls it in)" : "no"}`);
console.log(`OAuth scopes: ${manifest.oauthScopes.length}`);
if (problems.length) {
  console.error("CHECK FAILED:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("Check passed.");
