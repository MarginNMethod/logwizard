import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogWizard: set up an interaction log",
  description: "Answer ten plain-language questions and get a reviewed plan for a Google Sheets logging system. Demo mode needs no sign-in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-base leading-relaxed antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-blue-800">
          Skip to main content
        </a>
        <header className="border-b border-slate-300 bg-white">
          <nav aria-label="Main" className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-slate-900">LogWizard</Link>
            <ul className="flex gap-4 text-sm">
              <li><Link href="/start" className="text-blue-800 underline">Try the demo</Link></li>
              <li><Link href="/privacy" className="text-blue-800 underline">Privacy</Link></li>
            </ul>
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 pb-10 text-sm text-slate-700">
          A portfolio project. Sample data only. Costs nothing to run.
        </footer>
      </body>
    </html>
  );
}
