// Scan history kept in this browser's localStorage. The server stores no text by default,
// so keeping the text here, on the user's own device, is what lets old results show their
// highlights again. Nothing in here is sent anywhere.
import { useSyncExternalStore } from "react";
import type { DetectResult } from "@/lib/types";

export interface HistoryEntry {
  id: string; // scan id from the API
  savedAt: string; // ISO time
  title: string; // file name, or the first words of the text
  text: string;
  result: DetectResult;
}

const KEY = "ai-detector.history.v1";
const MAX_ENTRIES = 30;
const EMPTY: HistoryEntry[] = [];

let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getSnapshot(): HistoryEntry[] {
  if (cache === null) cache = read();
  return cache;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null; // another tab changed it
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function write(entries: HistoryEntry[]): void {
  let kept = entries;
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(kept));
      break;
    } catch {
      if (kept.length <= 1) break; // storage unavailable or one entry too big: keep it in memory only
      kept = kept.slice(0, Math.ceil(kept.length / 2)); // over quota: drop the oldest half
    }
  }
  cache = kept;
  listeners.forEach((l) => l());
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function addToHistory(text: string, result: DetectResult, filename?: string): void {
  const entry: HistoryEntry = {
    id: result.id,
    savedAt: new Date().toISOString(),
    title: filename || titleFrom(text),
    text,
    result,
  };
  write([entry, ...getSnapshot().filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES));
}

export function removeFromHistory(id: string): void {
  write(getSnapshot().filter((e) => e.id !== id));
}

export function clearHistory(): void {
  write([]);
}

function titleFrom(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 9).join(" ");
  return words.length < text.trim().length ? `${words}…` : words;
}
