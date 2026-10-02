/**
 * PolicyBanner — OWNER: C2. One small muted line under the top bar (keep it unobtrusive).
 */
export function PolicyBanner() {
  return (
    <p className="border-b border-line bg-subtle px-4 py-1.5 text-center text-xs text-muted">
      Prototype: policy rules and room data are illustrative, modeled on SFSU workflows, not authoritative university policy.
    </p>
  );
}
