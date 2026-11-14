"use client";

import { useState } from "react";
import Result, { aiPercent, VerdictBadge } from "@/components/Result";
import { Button, Card, EmptyHint } from "@/components/ui";
import { clearHistory, removeFromHistory, useHistory } from "@/lib/history";

export default function History() {
  const entries = useHistory();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = entries.find((e) => e.id === selected);
  const q = query.trim().toLowerCase();
  const visible = q ? entries.filter((e) => e.title.toLowerCase().includes(q) || e.text.toLowerCase().includes(q)) : entries;

  return (
    <div className="space-y-6">
      <Card className="print:hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Your last {entries.length > 0 ? entries.length : ""} scans, saved in this browser only. The server doesn’t
            keep your text.
          </p>
          {entries.length > 0 && (
            <div className="flex gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search scans…"
                aria-label="Search scans"
                className="w-44 rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-400/50"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (window.confirm("Delete all saved scans from this browser?")) {
                    clearHistory();
                    setSelected(null);
                  }
                }}
              >
                Clear history
              </Button>
            </div>
          )}
        </div>

        {entries.length === 0 ? (
          <EmptyHint>No scans yet. Results you analyse will appear here.</EmptyHint>
        ) : visible.length === 0 ? (
          <EmptyHint>No scans match “{query}”.</EmptyHint>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((e) => {
              const pct = aiPercent(e.result);
              return (
                <li
                  key={e.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-1 py-3 ${selected === e.id ? "bg-subtle" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={e.title}>
                      {e.title}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(e.savedAt).toLocaleString()} · {e.result.word_count.toLocaleString()} words
                      {pct !== null && ` · ${pct}% AI probability`}
                    </p>
                  </div>
                  <VerdictBadge label={e.result.label} short />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setSelected(e.id)}>
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        removeFromHistory(e.id);
                        if (selected === e.id) setSelected(null);
                      }}
                      aria-label={`Delete ${e.title}`}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {shown && <Result result={shown.result} text={shown.text} title={shown.title} />}
    </div>
  );
}
