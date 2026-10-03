"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Three-way rather than a single toggle, because "system" is a real choice
 * people expect to be able to return to once they have overridden it.
 *
 * Rendered as a radiogroup so keyboard and screen-reader users get the right
 * semantics, and the options stay visible rather than cycling on each click.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      // The server has no stored preference and reports "system". React swaps in
      // the real value immediately after hydration; this keeps that from reading
      // as a mismatch.
      suppressHydrationWarning
      className={cn(
        "flex items-center gap-0.5 rounded-full border-2 border-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = theme === value;
        // Only spell out the effective theme when it is inherited rather than
        // chosen, since "System (dark)" is the case where it is not obvious.
        const title = value === "system" && theme === "system" ? `System (${resolved})` : label;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={title}
            onClick={() => setTheme(value)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}