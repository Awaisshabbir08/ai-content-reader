"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHistory } from "@/lib/history";

interface NavItem {
  href: string;
  label: string;
  icon: string; // a single glyph keeps the bundle free of an icon library
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Detect",
    items: [
      { href: "/", label: "AI Detector", icon: "◎" },
      { href: "/batch", label: "Batch files", icon: "▤" },
      { href: "/history", label: "History", icon: "↺" },
    ],
  },
  {
    section: "Writing tools",
    items: [
      { href: "/word-counter", label: "Word counter", icon: "#" },
      { href: "/readability", label: "Readability & style", icon: "Aa" },
      { href: "/summarizer", label: "Summarizer", icon: "≡" },
      { href: "/citation-generator", label: "Citation generator", icon: "❝" },
    ],
  },
  {
    section: "About",
    items: [
      { href: "/how-it-works", label: "How it works", icon: "?" },
      { href: "/api-docs", label: "API", icon: "{}" },
    ],
  },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white"
      >
        AI
      </span>
      <span className="leading-tight">
        Content Detector
        <span className="block text-[11px] font-normal text-muted">Detection & writing tools</span>
      </span>
    </Link>
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const historyCount = useHistory().length;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex print:hidden">
        <div className="px-2">
          <Logo />
        </div>
        <nav aria-label="Main" className="mt-7 flex-1 space-y-6 overflow-y-auto">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.section}</p>
              <ul className="mt-2 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                        isActive(item.href) ? "bg-subtle font-medium text-foreground" : "text-muted hover:bg-subtle hover:text-foreground"
                      }`}
                    >
                      <span aria-hidden="true" className="w-5 text-center text-xs font-semibold">
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/history" && historyCount > 0 && (
                        <span className="rounded-full bg-subtle px-2 text-xs tabular-nums text-muted">{historyCount}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="px-2 text-[11px] leading-relaxed text-muted">
          Runs on your own server. Texts are not stored; history stays in this browser.
        </p>
      </aside>

      {/* Mobile and tablet: top bar with a scrollable tab row */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur lg:hidden print:hidden">
        <div className="px-4 pt-3">
          <Logo />
        </div>
        <nav aria-label="Main" className="mt-2 flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {NAV.flatMap((g) => g.items).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                isActive(item.href) ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-muted hover:bg-subtle"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
