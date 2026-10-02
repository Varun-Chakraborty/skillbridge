/**
 * Shared form styling. The resume form has enough fields that repeating these
 * class strings inline would drift, so they live here alongside the design
 * tokens they are built from.
 */

export const inputClass =
  "w-full rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-foreground";

/**
 * Textareas get square-ish corners and top alignment; a pill-shaped textarea
 * looks broken once it holds more than one line.
 */
export const textareaClass =
  "w-full rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm leading-relaxed outline-none focus:border-foreground";

export const labelClass = "text-sm font-semibold";

export const hintClass = "mt-1.5 block text-xs text-muted-foreground";

export const errorTextClass = "mt-1.5 block text-xs font-semibold text-destructive";

export const fieldsetClass = "rounded-3xl border-2 border-border bg-card p-5 sm:p-6";

/** Small uppercase kicker used above each group of fields. */
export const sectionTitleClass = "text-xs font-bold uppercase text-muted-foreground";
