import type { ReactNode } from "react";

// A tiny renderer for docs/privacy.md: headings, paragraphs, bullet lists, tables, rules, bold, code.
// It builds React elements only (no raw HTML), so the text cannot inject markup.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-slate-200 px-1">{part.slice(1, -1)}</code>;
    return part;
  });
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") { i++; continue; }
    if (/^---+$/.test(line.trim())) { out.push(<hr key={k++} className="my-6 border-slate-300" />); i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      const cls = level === 1 ? "mt-2 text-3xl font-bold" : level === 2 ? "mt-6 text-xl font-bold" : "mt-4 text-lg font-bold";
      const Tag = (`h${level}`) as "h1" | "h2" | "h3";
      out.push(<Tag key={k++} className={cls}>{inline(h[2] ?? "")}</Tag>);
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        const l = lines[i] ?? "";
        if (!/^\|?[\s:|-]+\|?$/.test(l.trim())) rows.push(cells(l));
        i++;
      }
      const [head = [], ...body] = rows;
      out.push(
        <div key={k++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr>{head.map((c, j) => <th key={j} scope="col" className="border border-slate-300 bg-slate-100 p-2">{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border border-slate-300 p-2 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^[-*]\s+/, "")); i++; }
      out.push(<ul key={k++} className="my-3 list-disc space-y-1 pl-6">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^(#{1,3}\s|---+$|\||[-*]\s)/.test((lines[i] ?? "").trim())) { para.push((lines[i] ?? "").trim()); i++; }
    out.push(<p key={k++} className="my-3">{inline(para.join(" "))}</p>);
  }
  return <>{out}</>;
}
