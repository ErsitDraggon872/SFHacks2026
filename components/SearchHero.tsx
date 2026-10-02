"use client";
/**
 * SearchHero — OWNER: C1. The focal point: centered headline + big search box + preset pills.
 * `compact` (results state) drops the headline and keeps the box at the top, still editable.
 * The Filters tab renders `filters` (QuickFilters, built by C2) in place of the textarea.
 */
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button, PillButton, Segmented } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import type { Preset } from "@/lib/presets";

export type SearchMode = "describe" | "filters";

export interface SearchHeroProps {
  mode: SearchMode;
  onMode: (m: SearchMode) => void;
  text: string;
  onText: (t: string) => void;
  onSubmit: () => void;
  presets: Preset[];
  onPreset: (p: Preset) => void;
  loading: boolean;
  compact: boolean;
  filters: ReactNode;
  footer?: ReactNode;
}

export function SearchHero({ mode, onMode, text, onText, onSubmit, presets, onPreset, loading, compact, filters, footer }: SearchHeroProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // grow the textarea with its content
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text, mode]);

  return (
    <section className={cn("w-full transition-[padding] duration-300", compact ? "pt-6" : "pt-[12vh]")}>
      {!compact && (
        <div className="mb-8 text-center gs-rise">
          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Book a room for your event.</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            Describe it in plain English. We check campus policy, rank the rooms that fit, and fill out the paperwork.
          </p>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <Segmented
          label="Search mode"
          value={mode}
          onChange={onMode}
          options={[
            { value: "describe", label: "Describe" },
            { value: "filters", label: "Filters" },
          ]}
        />
        {footer}
      </div>

      {mode === "describe" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="rounded-2xl border border-line-strong bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] focus-within:border-ink-2"
        >
          <label htmlFor="event-text" className="sr-only">
            Describe your event
          </label>
          <textarea
            id="event-text"
            ref={ref}
            rows={compact ? 1 : 2}
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="e.g. 40-person coding night with pizza, Thursday 6–9pm, need a projector"
            className="w-full resize-none bg-transparent px-2 py-1.5 text-base text-ink outline-none placeholder:text-faint"
          />
          <div className="flex items-center justify-between gap-2 pl-2">
            <span className="text-xs text-faint">Enter to search · Shift+Enter for a new line</span>
            <Button type="submit" disabled={loading || !text.trim()} aria-label="Find rooms">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Find rooms
              {!loading && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-line-strong bg-surface p-4">{filters}</div>
      )}

      {!compact && mode === "describe" && (
        <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Example requests">
          {presets.map((p) => (
            <PillButton key={p.id} onClick={() => onPreset(p)} disabled={loading}>
              {p.label}
            </PillButton>
          ))}
        </div>
      )}
    </section>
  );
}
