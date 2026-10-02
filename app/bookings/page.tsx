"use client";
/**
 * My bookings — every reservation the acting club has made, upcoming first, with live status
 * (staff approvals/denials from /admin show up here on reload). Upcoming active bookings can be
 * cancelled, which frees the room and the club's daily-cap minutes for everyone.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ClubSwitcher } from "@/components/ClubSwitcher";
import { PolicyBanner } from "@/components/PolicyBanner";
import { TopBar } from "@/components/TopBar";
import { Button, Card, Pill, SectionLabel, StatusIcon, type PillTone } from "@/components/ui";
import { cancelClubBooking, fetchClubBookings } from "@/lib/client/triageClient";
import { fmtDate, fmtMinutes, fmtTime } from "@/lib/client/format";
import { useClubId } from "@/lib/client/useClubId";
import { CLUBS, CLUB_BY_ID, ROOM_BY_ID } from "@/lib/data";
import { anchorDate } from "@/lib/normalize";
import type { Booking, BookingStatus, RuleStatus } from "@/lib/types";

const STATUS: Record<BookingStatus, { label: string; tone: PillTone; icon: RuleStatus; hint?: string }> = {
  confirmed: { label: "Confirmed", tone: "pass", icon: "pass" },
  pending_permit: { label: "Permit pending", tone: "warn", icon: "permit", hint: "Room is held — the required permit still needs sign-off." },
  pending_review: { label: "Awaiting staff review", tone: "escalate", icon: "escalate", hint: "Student Activities & Events will approve or deny this request." },
  denied: { label: "Denied", tone: "block", icon: "block" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "block" },
};

const CANCELLABLE: BookingStatus[] = ["confirmed", "pending_permit", "pending_review"];

export default function MyBookingsPage() {
  const [clubId, setClubId] = useClubId();
  // tagged with the club it was loaded for, so a club switch shows the skeleton until fresh data lands
  const [loaded, setLoaded] = useState<{ clubId: string; bookings: Booking[] | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClubBookings(clubId)
      .then((b) => !cancelled && setLoaded({ clubId, bookings: b, error: null }))
      .catch((e) => !cancelled && setLoaded({ clubId, bookings: null, error: e instanceof Error ? e.message : "Couldn't load bookings" }));
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const current = loaded?.clubId === clubId ? loaded : null;
  const bookings = current?.bookings ?? null;
  const error = current?.error ?? null;

  const onCancelled = (updated: Booking) =>
    setLoaded((l) => l && l.bookings && { ...l, bookings: l.bookings.map((b) => (b.id === updated.id ? updated : b)) });

  const today = anchorDate();
  const upcoming = bookings?.filter((b) => b.date >= today) ?? [];
  const past = (bookings?.filter((b) => b.date < today) ?? []).reverse();

  return (
    <>
      <TopBar right={<ClubSwitcher clubs={CLUBS} clubId={clubId} onChange={setClubId} />} />
      <PolicyBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">My bookings</h1>
          <p className="mt-1 text-sm text-muted">{CLUB_BY_ID[clubId]?.name ?? clubId}</p>
        </header>

        {error && (
          <p role="alert" className="rounded-xl bg-block-soft px-4 py-3 text-sm text-block">
            {error}
          </p>
        )}

        {!bookings && !error && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading bookings">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-sunken" />
            ))}
          </div>
        )}

        {bookings && bookings.length === 0 && (
          <Card className="px-6 py-10 text-center">
            <p className="text-sm text-ink-2">No bookings yet for this organization.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Book a room →
            </Link>
          </Card>
        )}

        {bookings && bookings.length > 0 && (
          <div className="space-y-8">
            <BookingSection label={`Upcoming · ${upcoming.length}`} rows={upcoming} empty="Nothing coming up." clubId={clubId} onCancelled={onCancelled} />
            {past.length > 0 && <BookingSection label={`Past · ${past.length}`} rows={past} muted />}
          </div>
        )}
      </main>
    </>
  );
}

interface SectionProps {
  label: string;
  rows: Booking[];
  empty?: string;
  muted?: boolean;
  /** Set for upcoming rows: enables Cancel. */
  clubId?: string;
  onCancelled?: (b: Booking) => void;
}

function BookingSection({ label, rows, empty, muted, clubId, onCancelled }: SectionProps) {
  return (
    <section>
      <SectionLabel className="mb-2">{label}</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={b.id}>
              <BookingRow booking={b} muted={muted} clubId={clubId} onCancelled={onCancelled} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingRow({
  booking: b,
  muted,
  clubId,
  onCancelled,
}: { booking: Booking; muted?: boolean; clubId?: string; onCancelled?: (b: Booking) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = STATUS[b.status] ?? STATUS.confirmed;
  const room = ROOM_BY_ID[b.roomId];
  const inactive = muted || !CANCELLABLE.includes(b.status);
  const canCancel = !muted && !!clubId && !!onCancelled && CANCELLABLE.includes(b.status);

  const cancel = async () => {
    if (!clubId || !onCancelled) return;
    setBusy(true);
    setError(null);
    try {
      onCancelled(await cancelClubBooking(b.id, clubId));
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel this booking");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={inactive ? "px-4 py-3 opacity-70" : "px-4 py-3"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{b.title}</p>
          <p className="mt-0.5 text-sm text-ink-2">
            {room?.name ?? b.roomId} · {fmtDate(b.date)} · {fmtTime(b.startTime)}–{fmtTime(b.endTime)}
            <span className="text-muted"> · {fmtMinutes(b.durationMin)}</span>
          </p>
        </div>
        <Pill tone={s.tone} icon={<StatusIcon status={s.icon} className="h-3.5 w-3.5" />}>
          {s.label}
        </Pill>
      </div>
      {s.hint && !inactive && <p className="mt-2 text-xs text-muted">{s.hint}</p>}

      {canCancel && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {confirming ? (
            <>
              <span className="mr-auto text-xs text-ink-2">Cancel this booking? The room will be released.</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
                Keep it
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={cancel}
                disabled={busy}
                className="border-block/30 text-block hover:bg-block-soft"
              >
                {busy ? "Cancelling…" : "Yes, cancel"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-ink-2 hover:text-block">
              Cancel booking
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-block">
          {error}
        </p>
      )}
    </Card>
  );
}
