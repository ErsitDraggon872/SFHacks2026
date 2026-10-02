"use client";
/**
 * BookingConfirmation — OWNER: C1. Shown after a successful booking; the request flow is cleared,
 * so the officer can't submit the same request twice.
 * Prototype: no email is actually sent (there's no auth); the line mirrors what the real system would do.
 */
import { Mail } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, Card, Pill, StatusIcon } from "@/components/ui";
import type { BookingConfirmationData } from "@/lib/client/useBookingFlow";
import { fmtDate, fmtTime } from "@/lib/client/format";
import { CLUB_BY_ID, ROOM_BY_ID } from "@/lib/data";

const COPY = {
  confirmed: {
    status: "pass",
    title: "Room booked",
    body: "You're all set. No further approval is needed.",
  },
  pending_permit: {
    status: "permit",
    title: "Room booked, permit pending",
    body: "The room is held for you. We've filed the pre-filled permit; the booking is final once it's approved.",
  },
  pending_review: {
    status: "escalate",
    title: "Sent for staff review",
    body: "Student Activities & Events has the briefing. The room is held until they approve or deny the request.",
  },
} as const;

export function BookingConfirmation({ data, onDone }: { data: BookingConfirmationData; onDone: () => void }) {
  const { booking, clubId, permits } = data;
  const copy = COPY[booking.status as keyof typeof COPY] ?? COPY.confirmed;
  const room = ROOM_BY_ID[booking.roomId];
  const club = CLUB_BY_ID[clubId];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    ref.current?.focus({ preventScroll: true });
  }, [booking.id]);

  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="gs-rise mt-6 scroll-mt-24 outline-none">
      <Card emphasis className="border-pass/30 p-5">
        <div className="flex items-start gap-3">
          <StatusIcon status={copy.status} className="mt-0.5 h-6 w-6" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{copy.title}</h2>
            <p className="text-sm text-ink-2">{copy.body}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-line bg-subtle p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Room</dt>
            <dd className="font-medium text-ink">{room?.name ?? booking.roomId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">When</dt>
            <dd className="font-medium text-ink">
              {fmtDate(booking.date)} · {fmtTime(booking.startTime)}–{fmtTime(booking.endTime)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Event</dt>
            <dd className="font-medium text-ink">{booking.title}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Confirmation #</dt>
            <dd className="font-mono text-xs text-ink">{booking.id}</dd>
          </div>
          {booking.description && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted">Description</dt>
              <dd className="whitespace-pre-line text-ink-2">{booking.description}</dd>
            </div>
          )}
        </dl>

        {permits.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {permits.map((p) => (
              <Pill key={p.permitId} tone="warn">
                {p.name} · {p.office}
              </Pill>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            Confirmation sent to the {club?.short ?? "organization"} officer email on file.
          </p>
          <Button variant="secondary" onClick={onDone} className="shrink-0">
            Book another room
          </Button>
        </div>
      </Card>
    </div>
  );
}
