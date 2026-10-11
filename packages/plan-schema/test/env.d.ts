// Minimal typing for Vite's import.meta.glob (used to load the JSON fixtures without Node types).
interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { eager: true; import: string }): Record<string, T>;
}
