"use client";
/**
 * Page state machine for the request flow: idle → loading → results. OWNER: C1.
 * The policy decision is ALWAYS derived locally from (facts, bookings, club, attested) via the
 * isomorphic engine, so chip edits / Fix It / club switches re-evaluate instantly with no network.
 * The server re-validates everything again at booking time.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROOMS, ROOM_BY_ID } from "@/lib/data";
import { anchorDate, emptyFacts, setFact } from "@/lib/normalize";
import { evaluate } from "@/lib/policy";
import type { Preset } from "@/lib/presets";
import { rankRooms } from "@/lib/rank";
import type {
  AiMode,
  Booking,
  CreateBookingResult,
  EventFacts,
  FactField,
  PermitRequirement,
  PolicyDecision,
  RankedRoom,
  TriageResponse,
  WriterOutput,
} from "@/lib/types";
import { FIXTURES, fetchAvailability, fixtureFromUrl, submitBooking, triage } from "./triageClient";
import { useClubId } from "./useClubId";
import type { SearchMode } from "@/components/SearchHero";

export type Phase = "idle" | "loading" | "results";

export interface BookingConfirmationData {
  booking: Booking;
  clubId: string;
  permits: PermitRequirement[];
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Sensible starting values for the Filters tab (Thursday of the demo week, 6–8 PM). */
export function initialFilterFacts(): EventFacts {
  let f = emptyFacts();
  f = setFact(f, "date", addDays(anchorDate(), 3));
  f = setFact(f, "startTime", "18:00");
  f = setFact(f, "endTime", "20:00");
  f = setFact(f, "headcount", 20);
  // no alcohol / guest-speaker toggles in Filters: assumed "no", which the officer must attest to
  f = { ...f, alcohol: { value: false, source: "default" }, guestSpeakers: { value: false, source: "default" } };
  return f;
}

export function useBookingFlow() {
  const [clubId, setClubId] = useClubId();
  const [mode, setMode] = useState<SearchMode>("describe");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [response, setResponse] = useState<TriageResponse | null>(null);
  const [original, setOriginal] = useState<EventFacts | null>(null);
  const [facts, setFacts] = useState<EventFacts | null>(null);
  const [filterFacts, setFilterFacts] = useState<EventFacts>(initialFilterFacts);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsDate, setBookingsDate] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<AiMode>("none");

  const [attested, setAttested] = useState(false);
  /** What the officer calls the event (prefilled from the AI summary) + an optional description. */
  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateBookingResult | null>(null);
  const [citeRuleId, setCiteRuleId] = useState<string | null>(null);
  /** Set after a successful booking; the request flow is cleared and this card is shown instead. */
  const [confirmation, setConfirmation] = useState<BookingConfirmationData | null>(null);

  const load = useCallback((r: TriageResponse) => {
    setConfirmation(null);
    setResponse(r);
    setOriginal(r.facts);
    setFacts(r.facts);
    setBookings(r.bookingsForDate);
    setBookingsDate(r.facts.date.value);
    setAiMode(r.aiMode);
    setAttested(false);
    setResult(null);
    setEventName(r.facts.summary.value ?? "");
    setEventDescription("");
    if (r.requestText) setText(r.requestText);
    setPhase("results");
  }, []);

  // ?fixture=pizza → jump straight into a results state (UI development)
  useEffect(() => {
    const name = fixtureFromUrl();
    if (name) load(structuredClone(FIXTURES[name]));
  }, [load]);

  // keep the bookings snapshot in sync when the user changes the date
  const date = facts?.date.value ?? null;
  useEffect(() => {
    if (!date || date === bookingsDate) return;
    let cancelled = false;
    fetchAvailability(date)
      .then((b) => {
        if (!cancelled) {
          setBookings(b);
          setBookingsDate(date);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [date, bookingsDate]);

  const decision: PolicyDecision | null = useMemo(
    () => (facts ? evaluate(facts, { rooms: ROOMS, bookings, clubId, attested }) : null),
    [facts, bookings, clubId, attested],
  );
  const ranked: RankedRoom[] = useMemo(
    () => (facts && decision ? rankRooms(facts, decision, ROOMS) : []),
    [facts, decision],
  );

  // the AI writer explained the ORIGINAL decision; hide it once edits change the tier
  const writer: WriterOutput | null =
    response?.writer && decision && decision.tier === response.decision.tier ? response.writer : null;

  const run = useCallback(
    async (req: Parameters<typeof triage>[0]) => {
      setPhase("loading");
      setError(null);
      try {
        load(await triage(req));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setPhase(response ? "results" : "idle");
      }
    },
    [load, response],
  );

  const runPreset = useCallback(
    (p: Preset) => {
      setClubId(p.clubId);
      setText(p.text);
      setMode("describe");
      void run({ clubId: p.clubId, presetId: p.id });
    },
    [run, setClubId],
  );

  const runText = useCallback(() => {
    if (!text.trim()) return;
    void run({ clubId, text: text.trim() });
  }, [run, clubId, text]);

  /** Filters tab: no AI at all, evaluate locally right away. */
  const runFilters = useCallback(() => {
    setConfirmation(null);
    setResponse(null);
    setOriginal(null);
    setFacts(filterFacts);
    setAiMode("none");
    setAttested(false);
    setResult(null);
    setEventName("");
    setEventDescription("");
    setError(null);
    setPhase("results");
  }, [filterFacts]);

  const edit = useCallback(<K extends FactField>(field: K, value: EventFacts[K]["value"]) => {
    setFacts((f) => (f ? setFact(f, field, value) : f));
    setResult(null);
  }, []);

  const selectRoom = useCallback((roomId: string) => edit("requestedRoomId", roomId), [edit]);

  const fix = useCallback(() => {
    if (decision?.suggestedRoomId) edit("requestedRoomId", decision.suggestedRoomId);
  }, [decision, edit]);

  const reset = useCallback(() => {
    setConfirmation(null);
    setPhase("idle");
    setResponse(null);
    setFacts(null);
    setOriginal(null);
    setResult(null);
    setError(null);
    setText("");
    setEventName("");
    setEventDescription("");
    setAiMode("none");
  }, []);

  const submit = useCallback(async () => {
    if (!facts || !decision?.targetRoomId || !eventName.trim()) return;
    setSubmitting(true);
    try {
      const r = await submitBooking({
        clubId,
        roomId: decision.targetRoomId,
        facts,
        attested,
        requestText: response?.requestText ?? null,
        draft: response?.draft ?? null,
        writer,
        eventName: eventName.trim(),
        eventDescription: eventDescription.trim() || null,
      });
      if (r.ok) {
        // done: clear the request so it can't be submitted twice, and remember the booking
        // locally so a Filters search on the same day sees the room as taken
        const booking = r.booking;
        reset();
        setBookings((b) => (bookingsDate === booking.date ? [...b, booking] : b));
        setConfirmation({ booking, clubId, permits: r.decision.permitsRequired });
      } else {
        setResult(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }, [facts, decision, clubId, attested, response, writer, eventName, eventDescription, bookingsDate, reset]);

  return {
    // state
    clubId,
    mode,
    text,
    phase,
    error,
    response,
    original,
    facts,
    filterFacts,
    aiMode,
    attested,
    eventName,
    eventDescription,
    submitting,
    result,
    citeRuleId,
    confirmation,
    // derived
    decision,
    ranked,
    writer,
    targetRoom: decision?.targetRoomId ? ROOM_BY_ID[decision.targetRoomId] ?? null : null,
    suggestedRoom: decision?.suggestedRoomId ? ROOM_BY_ID[decision.suggestedRoomId] ?? null : null,
    // actions
    setClubId,
    setMode,
    setText,
    setFilterFacts,
    setAttested,
    setEventName,
    setEventDescription,
    setCiteRuleId,
    runPreset,
    runText,
    runFilters,
    edit,
    selectRoom,
    fix,
    submit,
    reset,
    dismissConfirmation: () => setConfirmation(null),
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
