// Bundle src/ into ONE dist/Code.js for Apps Script, and copy appsscript.json next to it.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

// Functions Apps Script must be able to call by name (menus, triggers, google.script.run).
export const ENTRY_POINTS = [
  "onOpen", "activate", "showAddEntrySidebar", "submitEntry", "onFormSubmit",
  "runRoutingNow", "sendTestReminder", "hourlyTick", "showHelp", "showPastePlanDialog", "savePlanFromDialog", "previewPlanFromDialog",
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// The iife keeps everything in one scope (no top-level export). Each entry point is then declared as a
// top-level function that forwards to it, which is what Apps Script looks up by name.
const footer = ENTRY_POINTS.map((n) => `function ${n}() { return __LW.${n}.apply(this, arguments); }`).join("\n");

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/Code.js",
  bundle: true,
  format: "iife",
  globalName: "__LW",
  target: "es2019",
  platform: "browser",
  minify: false,
  legalComments: "none",
  footer: { js: footer },
  logLevel: "warning",
});
copyFileSync("appsscript.json", "dist/appsscript.json");
console.log("Built dist/Code.js and dist/appsscript.json");
