export function button(kind: "primary" | "secondary" = "secondary"): string {
  const base = "inline-block rounded-md px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60";
  return kind === "primary"
    ? `${base} bg-blue-800 text-white hover:bg-blue-900`
    : `${base} border border-slate-500 bg-white text-slate-900 hover:bg-slate-100`;
}

export const inputClass = "block w-full rounded-md border border-slate-500 bg-white px-3 py-2 text-slate-900";
export const cardClass = "rounded-lg border border-slate-300 bg-white p-5";
