import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 disabled:bg-line-strong disabled:text-white",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle disabled:text-faint",
  ghost: "bg-transparent text-ink-2 hover:bg-sunken disabled:text-faint",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/** Pill-shaped button. primary = black, secondary = outlined, ghost = text only. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium transition-colors disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
});
