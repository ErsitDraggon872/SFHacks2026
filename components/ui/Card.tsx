import type { HTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

/** White box with a hairline border. `emphasis` adds a soft shadow (used for the #1 result). */
export function Card({ className, emphasis, ...rest }: HTMLAttributes<HTMLDivElement> & { emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface",
        emphasis && "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]",
        className,
      )}
      {...rest}
    />
  );
}

/** Small uppercase section label. */
export function SectionLabel({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs font-medium uppercase tracking-wide text-muted", className)} {...rest} />;
}
