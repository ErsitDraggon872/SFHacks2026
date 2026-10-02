import type { ReactNode } from "react";

/**
 * Dashed box marking a component Computer 2 still has to build.
 * Remove the <Placeholder> from a component body once that component is implemented.
 */
export function Placeholder({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-subtle px-4 py-3 text-xs text-muted">
      <span className="font-mono font-medium text-ink-2">{`<${name} />`}</span>
      <span className="ml-2">placeholder: C2 builds this</span>
      {children && <div className="mt-1.5 text-ink-2">{children}</div>}
    </div>
  );
}
