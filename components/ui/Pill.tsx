import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/client/cn";

export type PillTone = "neutral" | "accent" | "pass" | "warn" | "block" | "escalate" | "outline";

const TONE: Record<PillTone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent",
  pass: "bg-pass-soft text-pass",
  warn: "bg-warn-soft text-warn",
  block: "bg-block-soft text-block",
  escalate: "bg-escalate-soft text-escalate",
  outline: "bg-surface text-ink-2 border border-line border-dashed",
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  icon?: ReactNode;
}

/** Small rounded label. Static; use PillButton for clickable pills. */
export function Pill({ tone = "neutral", icon, className, children, ...rest }: PillProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[tone], className)}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: PillTone;
  icon?: ReactNode;
}

/** Clickable pill (presets, fact chips). */
export function PillButton({ tone = "neutral", icon, className, children, type = "button", ...rest }: PillButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-[filter] hover:brightness-95",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
