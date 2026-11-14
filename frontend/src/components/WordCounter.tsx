"use client";

import Link from "next/link";
import { Button, Card, EmptyHint, Stat, TextBox } from "@/components/ui";
import { draft, setDraftText, useStore } from "@/lib/store";
import { formatMinutes, textStats } from "@/lib/text-stats";

export default function WordCounter() {
  const { text } = useStore(draft);
  const s = textStats(text);
  const hasText = s.words > 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <TextBox
          value={text}
          onChange={setDraftText}
          rows={16}
          placeholder="Type or paste your text. Counts update as you type."
          footer={
            <>
              <span>Your text is shared with the other tools on this site.</span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => setDraftText("")} disabled={!text}>
                  Clear
                </Button>
                <Link
                  href="/"
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Check for AI →
                </Link>
              </span>
            </>
          }
        />
      </Card>

      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Words" value={s.words.toLocaleString()} />
          <Stat label="Characters" value={s.characters.toLocaleString()} hint={`${s.charactersNoSpaces.toLocaleString()} without spaces`} />
          <Stat label="Sentences" value={s.sentences.toLocaleString()} />
          <Stat label="Paragraphs" value={s.paragraphs.toLocaleString()} />
          <Stat label="Reading time" value={formatMinutes(s.readingMinutes)} hint="at 238 words/min" />
          <Stat label="Speaking time" value={formatMinutes(s.speakingMinutes)} hint="at 150 words/min" />
        </dl>

        <Card>
          <h2 className="text-sm font-medium">Details</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <Row label="Unique words" value={s.uniqueWords.toLocaleString()} />
            <Row label="Average word length" value={hasText ? `${s.avgWordLength.toFixed(1)} letters` : "–"} />
            <Row label="Average sentence" value={hasText ? `${s.avgSentenceLength.toFixed(1)} words` : "–"} />
            <Row label="Longest sentence" value={hasText ? `${s.longestSentenceWords} words` : "–"} />
            <Row label="Syllables" value={s.syllables.toLocaleString()} />
            <Row
              label="Lexical density"
              value={hasText ? `${Math.round(s.lexicalDensity * 100)}%` : "–"}
              hint="Share of words that carry content (not 'the', 'and', …)"
            />
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-medium">Keyword density</h2>
          {s.keywords.length === 0 ? (
            <EmptyHint>Repeated keywords will show here.</EmptyHint>
          ) : (
            <ul className="mt-3 space-y-2">
              {s.keywords.map((k) => (
                <li key={k.word} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{k.word}</span>
                    <span className="tabular-nums text-muted">
                      {k.count} · {(k.density * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-human-track">
                    <div
                      className="h-full rounded-full bg-human"
                      style={{ width: `${(k.count / s.keywords[0].count) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {s.phrases.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-medium text-muted">Repeated phrases</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {s.phrases.map((p) => (
                  <li key={p.phrase} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                    {p.phrase} <span className="tabular-nums text-muted">×{p.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3" title={hint}>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
