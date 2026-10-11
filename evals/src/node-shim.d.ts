// Minimal typings for the few Node APIs the runner uses (avoids needing @types/node).
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function readdirSync(path: string): string[];
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function resolve(...parts: string[]): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
declare const process: { argv: string[]; exitCode?: number; stdout: { write(s: string): void } };
declare module "node:os" {
  export function tmpdir(): string;
}
interface ImportMeta {
  dirname: string;
}
