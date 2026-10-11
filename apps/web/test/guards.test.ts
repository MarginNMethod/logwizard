import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const NAME = ["ANTHROPIC", "API", "KEY"].join("_");
const ALLOWED = new Set(["lib/planner/byok.ts", "lib/planner/live.ts", "test/guards.test.ts", "test/planner.test.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "data/recordings"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (SKIP_DIRS.has(name) || SKIP_DIRS.has(rel)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(rel);
  }
  return out;
}

describe("repository guards", () => {
  const files = walk(root);

  it("finds the web app files", () => {
    expect(files).toContain("lib/planner/byok.ts");
    expect(files).toContain("app/api/plan/route.ts");
  });

  it("references the server AI key variable only in the byok and live modules", () => {
    const offenders = files.filter((f) => !ALLOWED.has(f) && !f.endsWith(".tsbuildinfo") && readFileSync(path.join(root, f), "utf8").includes(NAME));
    expect(offenders).toEqual([]);
  });

  it("never lets the server key variable be read anywhere except live.ts", () => {
    const readers = files.filter((f) => /^(lib|app|components)\//.test(f) && /process\.env\.ANTHROPIC_API/.test(readFileSync(path.join(root, f), "utf8")));
    expect(readers).toEqual([]);
  });

  it("keeps the expected block out of the shipped personas", () => {
    const personas = readFileSync(path.join(root, "data/personas.json"), "utf8");
    expect(personas).not.toContain('"expected"');
    expect(personas).not.toContain("must_refuse");
  });

  it("has no em dashes in app source or docs", () => {
    const dash = String.fromCharCode(0x2014);
    const offenders = files.filter((f) => /\.(ts|tsx|md|css|example)$/.test(f) && !f.startsWith("data/") && readFileSync(path.join(root, f), "utf8").includes(dash));
    expect(offenders).toEqual([]);
  });

  it("only uses example.com for email addresses in app source", () => {
    const offenders: string[] = [];
    for (const f of files.filter((x) => /\.(ts|tsx)$/.test(x) && !x.startsWith("data/") && !x.startsWith("test/"))) {
      for (const m of readFileSync(path.join(root, f), "utf8").matchAll(/[\w.+-]+@([\w-]+\.[\w.-]+)/g)) if (!/example\.com$/.test(m[1]!)) offenders.push(`${f}:${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
