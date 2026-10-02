import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

const INPUT =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-ink-2";

/** Label + control + optional hint. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(INPUT, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...rest },
  ref,
) {
  return <select ref={ref} className={cn(INPUT, "pr-8", className)} {...rest} />;
});

/** Yes / No / Not sure control for tri-state facts (null = "Not sure"). */
export function TriToggle({
  value,
  onChange,
  label,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  label: string;
}) {
  const opts: { v: boolean | null; t: string }[] = [
    { v: true, t: "Yes" },
    { v: false, t: "No" },
    { v: null, t: "Not sure" },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-sunken p-0.5 text-sm">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-full px-3 py-1",
            value === o.v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

/** Checkbox with a label. */
export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[#0a0a0a]"
      />
      <span>{children}</span>
    </label>
  );
}
