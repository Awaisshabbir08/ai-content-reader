"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { aiPercent, VerdictBadge } from "@/components/Result";
import { Alert, Button, Card, CopyButton, EmptyHint, Segmented, TextBox } from "@/components/ui";
import { fetchInfo } from "@/lib/api";
import {
  cancelHumanize,
  humanizeDraft,
  humanizer,
  moveRewriteToDraft,
  openRewriteReport,
  setTone,
  TONES,
} from "@/lib/humanizer-store";
import { draft, setDraftText, useStore } from "@/lib/store";
import { countWords, type DetectResult, type HumanizerInfo, type HumanizeTone } from "@/lib/types";

const DEFAULT_LIMITS = { min_words: 20, max_words: 1000 };

const toneLabel = (tone: HumanizeTone) => TONES.find((t) => t.id === tone)?.label ?? tone;

export default function Humanizer() {
  const { text } = useStore(draft);
  const state = useStore(humanizer);
  // undefined while loading; null if the backend is unreachable or predates the humanizer
  const [info, setInfo] = useState<HumanizerInfo | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetchInfo()
      .then((i) => alive && setInfo(i.humanizer ?? null))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, []);

  const words = countWords(text);
  const { min_words: minWords, max_words: maxWords } = info ?? DEFAULT_LIMITS;
  const notSetUp = info?.enabled === false;
  const local = info?.engine !== "claude"; // local is the default engine
  const busy = state.phase !== "idle";
  const again = state.output?.source === text;
  const canRun = !busy && !notSetUp && words >= minWords && words <= maxWords;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Your text</h2>
          <Segmented label="Tone" value={state.tone} onChange={setTone} options={TONES} disabled={busy} />
        </div>
        <TextBox
          value={text}
          onChange={setDraftText}
          rows={16}
          placeholder={`Paste AI-generated text to rewrite (${minWords}–${maxWords.toLocaleString()} words).`}
          footer={
            <>
              <span className={words > maxWords ? "font-medium text-rose-700 dark:text-rose-300" : ""}>
                {words.toLocaleString()} / {maxWords.toLocaleString()} words
              </span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => setDraftText("")} disabled={!text || busy}>
                  Clear
                </Button>
                <Button variant="primary" onClick={humanizeDraft} disabled={!canRun}>
                  {again ? "Rewrite again" : "Humanize"}
                </Button>
              </span>
            </>
          }
        />
        {notSetUp && <Alert tone="warning">{info?.problem ?? "The humanizer isn’t set up yet."}</Alert>}
        {!notSetUp && words > 0 && words < minWords && (
          <p className="mt-3 text-sm text-muted">Add {minWords - words} more words to humanize.</p>
        )}
        {words > maxWords && (
          <Alert tone="warning">
            That’s over the {maxWords.toLocaleString()}-word limit. Split the text and humanize it in parts.
          </Alert>
        )}
        {state.error && <Alert>{state.error}</Alert>}
        <p className="mt-4 text-xs text-muted">
          {local
            ? `Rewritten by a free AI model${info?.model ? ` (${info.model})` : ""} running on this server; your text doesn’t leave it.`
            : `The humanizer sends your text to Anthropic’s Claude API${info?.model ? ` (${info.model})` : ""} to rewrite it; detection still runs on this server.`}{" "}
          The meaning should stay the same, but always read the rewrite before you use it.
        </p>
      </Card>

      <Card>
        <h2 className="font-medium">Humanized text</h2>
        {state.phase === "rewriting" ? (
          <Working startedAt={state.startedAt} local={local} />
        ) : state.output ? (
          <>
            <div className="mt-3 max-h-[440px] overflow-auto whitespace-pre-wrap text-[15px] leading-7">
              {state.output.text}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-muted">
                {state.output.word_count.toLocaleString()} words · {toneLabel(state.output.tone)} tone
              </span>
              <span className="flex flex-wrap gap-2">
                <CopyButton size="sm" label="Copy text" getText={() => humanizer.get().output?.text ?? ""} />
                <Button size="sm" onClick={moveRewriteToDraft} disabled={busy}>
                  Use as my text
                </Button>
              </span>
            </div>
            <ScoreCompare
              before={state.before}
              after={state.after}
              checking={state.phase === "checking"}
              error={state.checkError}
            />
          </>
        ) : (
          <EmptyHint>Your rewritten text will appear here.</EmptyHint>
        )}
      </Card>
    </div>
  );
}

function Working({ startedAt, local }: { startedAt: number | null; local: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
      <span
        aria-hidden="true"
        className="h-6 w-6 rounded-full border-2 border-border border-t-zinc-700 motion-safe:animate-spin dark:border-t-zinc-200"
      />
      <p className="text-[15px]">
        {local ? "Rewriting with the local model…" : "Rewriting with Claude…"}{" "}
        <span className="tabular-nums text-muted">{seconds} s</span>
      </p>
      <p className="text-sm text-muted">
        {local ? "The free model takes about a minute per 300 words." : "Long texts can take up to a minute."}
      </p>
      <Button size="sm" onClick={cancelHumanize}>
        Cancel
      </Button>
    </div>
  );
}

function ScoreCompare({
  before,
  after,
  checking,
  error,
}: {
  before: DetectResult | null;
  after: DetectResult | null;
  checking: boolean;
  error: string | null;
}) {
  if (error && !before && !after) {
    return <Alert tone="warning">{error}</Alert>;
  }
  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium">Detector check</h3>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <ScoreTile label="Original" result={before} checking={checking} />
        <span aria-hidden="true" className="text-muted">
          →
        </span>
        <ScoreTile label="Humanized" result={after} checking={checking} />
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {after && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>Scores from this site’s detector. Other detectors may disagree.</span>
          <Link
            href="/"
            onClick={openRewriteReport}
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            See sentence highlights
          </Link>
        </div>
      )}
    </div>
  );
}

function ScoreTile({ label, result, checking }: { label: string; result: DetectResult | null; checking: boolean }) {
  const pct = result ? aiPercent(result) : null;
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      {result ? (
        <>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {pct === null ? "–" : `${pct}%`} <span className="text-xs font-normal text-muted">AI</span>
          </p>
          <div className="mt-1">
            <VerdictBadge label={result.label} short />
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">{checking ? "Checking…" : "–"}</p>
      )}
    </div>
  );
}
