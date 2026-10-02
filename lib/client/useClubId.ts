"use client";
/**
 * "Acting as" club, remembered across pages (request page ↔ My bookings) in localStorage.
 * The server render uses the default; the client restores the saved value after hydration.
 */
import { useCallback, useSyncExternalStore } from "react";
import { CLUB_BY_ID } from "@/lib/data";

const KEY = "gatorspace.clubId";
const EVENT = "gatorspace:club";
const DEFAULT_CLUB = "acm";

// fallback when storage is blocked, so switching still works for this tab
let memory = DEFAULT_CLUB;

function read(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && CLUB_BY_ID[saved]) return saved;
  } catch {
    // storage blocked
  }
  return memory;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useClubId() {
  const clubId = useSyncExternalStore(subscribe, read, () => DEFAULT_CLUB);
  const setClubId = useCallback((id: string) => {
    memory = id;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // storage blocked: `memory` covers this tab
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [clubId, setClubId] as const;
}
