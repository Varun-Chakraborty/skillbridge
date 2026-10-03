"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "skillbridge-theme";

/**
 * Hand-rolled rather than pulled from a package, to match how the rest of this
 * project is built (auth, the Prisma client and the sync all avoid a dependency
 * for something small and specific).
 *
 * The theme is read through `useSyncExternalStore` because localStorage and
 * `prefers-color-scheme` are exactly the "external store" case it exists for:
 * both are browser-only, so the server snapshot is a constant, and reading them
 * in an effect instead would mean a setState during render's commit and a
 * second pass over the tree.
 *
 * The class on <html> is set by a blocking script in the document head, so the
 * right palette is on screen before React hydrates. `apply` below repeats that
 * work for changes made after load and must agree with it.
 */
type Snapshot = { theme: Theme; resolved: "light" | "dark" };

const SERVER_SNAPSHOT: Snapshot = { theme: "system", resolved: "light" };

function readStored(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private browsing or a blocked storage partition; fall through to system.
  }
  return "system";
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): "light" | "dark" {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

function apply(theme: Theme) {
  const dark = resolve(theme) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  // Keeps form controls, scrollbars and the canvas background in step.
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/**
 * `getSnapshot` has to return an identical reference when nothing changed, or
 * React re-renders forever. The cache is what guarantees that.
 */
let cache: Snapshot | null = null;
function getSnapshot(): Snapshot {
  const theme = readStored();
  const next: Snapshot = { theme, resolved: resolve(theme) };
  if (cache && cache.theme === next.theme && cache.resolved === next.resolved) return cache;
  cache = next;
  return next;
}

const listeners = new Set<() => void>();
let mediaQuery: MediaQueryList | null = null;
let refCount = 0;

function emit() {
  cache = null;
  apply(getSnapshot().theme);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  refCount += 1;

  if (refCount === 1) {
    // Attaches once no matter how many components read the theme, so an OS
    // switch re-paints every subscriber.
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", emit);
    window.addEventListener("storage", emit);
  }

  return () => {
    listeners.delete(listener);
    refCount -= 1;
    if (refCount === 0 && mediaQuery) {
      mediaQuery.removeEventListener("change", emit);
      window.removeEventListener("storage", emit);
      mediaQuery = null;
    }
  };
}

type ThemeContextValue = Snapshot & { setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);

  const setTheme = useCallback((theme: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Nothing to persist to; the class is still applied for this page view.
    }
    emit();
  }, []);

  const value = useMemo(() => ({ ...snapshot, setTheme }), [snapshot, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}