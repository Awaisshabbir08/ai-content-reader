"use client";

import { useState } from "react";
import { Button, Card, CopyButton, EmptyHint } from "@/components/ui";
import {
  EMPTY_SOURCE,
  formatCitation,
  isComplete,
  STYLES,
  toHtml,
  toPlain,
  type CitationStyle,
  type Segment,
  type SourceFields,
  type SourceType,
} from "@/lib/citation";
import { createStore, useStore } from "@/lib/store";

// The bibliography survives page changes (but not a reload).
const bibliography = createStore<{ items: { id: number; source: SourceFields }[] }>({ items: [] });
let nextId = 1;

const TYPES: { id: SourceType; label: string }[] = [
  { id: "website", label: "Website" },
  { id: "book", label: "Book" },
  { id: "journal", label: "Journal article" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CitationGenerator() {
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [src, setSrc] = useState<SourceFields>(EMPTY_SOURCE);
  const { items } = useStore(bibliography);

  const set = (patch: Partial<SourceFields>) => setSrc((s) => ({ ...s, ...patch }));
  const citation = formatCitation(style, src);
  const ready = isComplete(src);
  const entries = items
    .map((it) => ({ ...it, citation: formatCitation(style, it.source) }))
    .sort((a, b) => toPlain(a.citation.reference).localeCompare(toPlain(b.citation.reference)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">Style</span>
        <div role="radiogroup" aria-label="Citation style" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={style === s.id}
              onClick={() => setStyle(s.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                style === s.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div role="tablist" aria-label="Source type" className="flex gap-1 border-b border-border pb-3">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={src.type === t.id}
                onClick={() => set({ type: t.id })}
                className={`rounded-md px-3 py-1.5 text-sm ${src.type === t.id ? "bg-subtle font-medium" : "text-muted hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Authors</legend>
            <p className="text-xs text-muted">For an organisation, put its name under “Last name” and leave “First name” empty.</p>
            <div className="mt-2 space-y-2">
              {src.authors.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label={`Author ${i + 1} first name`}
                    placeholder="First name"
                    value={a.first}
                    onChange={(e) => set({ authors: src.authors.map((x, j) => (j === i ? { ...x, first: e.target.value } : x)) })}
                    className={INPUT}
                  />
                  <input
                    aria-label={`Author ${i + 1} last name`}
                    placeholder="Last name"
                    value={a.last}
                    onChange={(e) => set({ authors: src.authors.map((x, j) => (j === i ? { ...x, last: e.target.value } : x)) })}
                    className={INPUT}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove author ${i + 1}`}
                    disabled={src.authors.length === 1}
                    onClick={() => set({ authors: src.authors.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => set({ authors: [...src.authors, { first: "", last: "" }] })}>
              + Add author
            </Button>
          </fieldset>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={src.type === "website" ? "Page title" : src.type === "book" ? "Book title" : "Article title"} className="sm:col-span-2">
              <input value={src.title} onChange={(e) => set({ title: e.target.value })} className={INPUT} />
            </Field>
            {src.type !== "book" && (
              <Field label={src.type === "website" ? "Website name" : "Journal name"} className="sm:col-span-2">
                <input value={src.container} onChange={(e) => set({ container: e.target.value })} className={INPUT} />
              </Field>
            )}
            {src.type === "book" && (
              <>
                <Field label="Publisher">
                  <input value={src.publisher} onChange={(e) => set({ publisher: e.target.value })} className={INPUT} />
                </Field>
                <Field label="Place (optional)">
                  <input value={src.place} onChange={(e) => set({ place: e.target.value })} placeholder="e.g. London" className={INPUT} />
                </Field>
                <Field label="Edition (optional)">
                  <input value={src.edition} onChange={(e) => set({ edition: e.target.value })} placeholder="e.g. 2" className={INPUT} />
                </Field>
              </>
            )}
            <Field label="Year">
              <input value={src.year} inputMode="numeric" onChange={(e) => set({ year: e.target.value })} placeholder="e.g. 2024" className={INPUT} />
            </Field>
            {src.type === "website" && (
              <>
                <Field label="Month">
                  <select value={src.month} onChange={(e) => set({ month: e.target.value })} className={INPUT}>
                    <option value="">–</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={String(i + 1)}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Day">
                  <input value={src.day} inputMode="numeric" onChange={(e) => set({ day: e.target.value })} className={INPUT} />
                </Field>
              </>
            )}
            {src.type === "journal" && (
              <>
                <Field label="Volume">
                  <input value={src.volume} onChange={(e) => set({ volume: e.target.value })} className={INPUT} />
                </Field>
                <Field label="Issue">
                  <input value={src.issue} onChange={(e) => set({ issue: e.target.value })} className={INPUT} />
                </Field>
                <Field label="Pages">
                  <input value={src.pages} onChange={(e) => set({ pages: e.target.value })} placeholder="e.g. 12-34" className={INPUT} />
                </Field>
              </>
            )}
            {src.type !== "website" && (
              <Field label="DOI (optional)" className={src.type === "journal" ? "" : "sm:col-span-2"}>
                <input value={src.doi} onChange={(e) => set({ doi: e.target.value })} placeholder="10.1000/xyz123" className={INPUT} />
              </Field>
            )}
            <Field label={src.type === "website" ? "URL" : "URL (optional)"} className="sm:col-span-2">
              <input value={src.url} type="url" onChange={(e) => set({ url: e.target.value })} placeholder="https://" className={INPUT} />
            </Field>
            {src.type === "website" && (
              <Field label="Date accessed">
                <input value={src.accessed} type="date" onChange={(e) => set({ accessed: e.target.value })} className={INPUT} />
              </Field>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setSrc({ ...EMPTY_SOURCE, type: src.type })}>
              Reset form
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-medium">Reference list entry</h2>
            {ready ? (
              <>
                <p className="mt-3 rounded-lg bg-subtle p-3 pl-8 -indent-5 text-[15px] leading-relaxed">
                  <Rich segments={citation.reference} />
                </p>
                <h3 className="mt-4 text-sm font-medium">In-text citation</h3>
                <p className="mt-2 rounded-lg bg-subtle p-3 text-[15px]">
                  <Rich segments={citation.inText} />
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <CopyButton label="Copy reference" getText={() => toPlain(citation.reference)} getHtml={() => toHtml(citation.reference)} />
                  <CopyButton label="Copy in-text" getText={() => toPlain(citation.inText)} getHtml={() => toHtml(citation.inText)} />
                  <Button
                    variant="primary"
                    onClick={() => {
                      bibliography.set((b) => ({ items: [...b.items, { id: nextId++, source: src }] }));
                      setSrc({ ...EMPTY_SOURCE, type: src.type });
                    }}
                  >
                    Add to bibliography
                  </Button>
                </div>
                {style === "apa" && (
                  <p className="mt-3 text-xs text-muted">
                    APA uses sentence case for article and book titles (only the first word and proper nouns capitalised).
                  </p>
                )}
              </>
            ) : (
              <EmptyHint>Fill in at least a title to see the citation.</EmptyHint>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Bibliography ({entries.length})</h2>
              {entries.length > 0 && (
                <div className="flex gap-2">
                  <CopyButton
                    size="sm"
                    label="Copy all"
                    getText={() => entries.map((e) => toPlain(e.citation.reference)).join("\n\n")}
                    getHtml={() => entries.map((e) => `<p>${toHtml(e.citation.reference)}</p>`).join("")}
                  />
                  <Button size="sm" variant="ghost" onClick={() => bibliography.set({ items: [] })}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
            {entries.length === 0 ? (
              <EmptyHint>Sources you add appear here, sorted alphabetically in the chosen style.</EmptyHint>
            ) : (
              <ol className="mt-3 space-y-3">
                {entries.map((e) => (
                  <li key={e.id} className="group flex gap-2">
                    <p className="flex-1 pl-6 -indent-6 text-sm leading-relaxed">
                      <Rich segments={e.citation.reference} />
                    </p>
                    <button
                      type="button"
                      aria-label="Remove from bibliography"
                      onClick={() => bibliography.set((b) => ({ items: b.items.filter((x) => x.id !== e.id) }))}
                      className="h-6 rounded px-1.5 text-xs text-muted hover:bg-subtle"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400/50";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function Rich({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) => (s.italic ? <i key={i}>{s.text}</i> : <span key={i}>{s.text}</span>))}
    </>
  );
}
