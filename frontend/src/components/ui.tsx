"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5 print:shadow-none ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, children }: { title: string; description: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 print:hidden">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-muted">{description}</p>
      {children}
    </header>
  );
}

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  secondary: "border border-border bg-surface hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-foreground",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** Copies text (and optional HTML, so formatting survives pasting into Word or Docs). */
export function CopyButton({
  getText,
  getHtml,
  label = "Copy",
  size = "md",
  disabled,
}: {
  getText: () => string;
  getHtml?: () => string;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      const text = getText();
      if (getHtml && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([getHtml()], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  }
  return (
    <Button size={size} onClick={copy} disabled={disabled} aria-live="polite">
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}

/** Small stat tile: a label and a value, with an optional hint underneath. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-[15px] text-muted">{children}</p>;
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "warning" }) {
  return (
    <p
      role="alert"
      className={`mt-3 rounded-lg p-3 text-sm ${
        tone === "error"
          ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300"
          : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
      }`}
    >
      {children}
    </p>
  );
}

/** Textarea bound to the shared draft, with a word/character counter underneath. */
export function TextBox({
  value,
  onChange,
  placeholder,
  rows = 10,
  footer,
  id = "text",
  label = "Your text",
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  rows?: number;
  footer?: ReactNode;
  id?: string;
  label?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-border bg-transparent p-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-zinc-400/50"
      />
      {footer && <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">{footer}</div>}
    </div>
  );
}
