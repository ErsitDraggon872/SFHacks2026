/** TopBar — OWNER: C1. Wordmark left; club switcher, quota, admin link right (slots filled by the page). */
import Link from "next/link";
import type { ReactNode } from "react";

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
          GatorSpace
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          {right}
          <Link href="/admin" className="rounded-full px-3 py-1 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
