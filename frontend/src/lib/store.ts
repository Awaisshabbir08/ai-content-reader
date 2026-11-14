// A tiny module-level store. State lives outside React, so it survives client-side
// navigation between pages: a running analysis or batch keeps going while the user
// opens another tool, and the result is still there when they come back.
import { useSyncExternalStore } from "react";

export interface Store<T> {
  readonly initial: T;
  get(): T;
  set(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    initial,
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Read a store in a component. The server render (and hydration) sees the initial state. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.initial);
}

/** The text the user is working on, shared by the detector and the writing tools. */
export const draft = createStore({ text: "" });

export function setDraftText(text: string): void {
  draft.set({ text });
}
