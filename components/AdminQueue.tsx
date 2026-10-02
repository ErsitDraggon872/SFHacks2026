"use client";
/**
 * AdminQueue — OWNER: C2 / C3.
 * Full-featured SA&E review queue and audit log:
 * - See all auto-confirmed bookings, pending reviews, and permit drafts
 * - View detailed event description, extracted facts, AI briefing, and user corrections
 * - Reject auto-confirmed bookings and send a notification message to the booking party
 * - Approve or reject pending bookings and send custom confirmation notices
 * - Real-time metrics bar and estimated review time saved calculator
 */
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, Pill, SectionLabel, StatusIcon } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import { FACT_LABEL, fmtDate, fmtFactValue, fmtTime } from "@/lib/client/format";
import { CLUB_BY_ID, ROOM_BY_ID } from "@/lib/data";
import type { AdminResponse, DecisionSnapshot, FactField, SnapshotStatus } from "@/lib/types";

export interface AdminQueueProps {
  initialData?: AdminResponse | null;
  onRefresh?: () => void;
}

type TabFilter = "all" | "auto" | "pending" | "permit" | "denied";

const STATUS_CONFIG: Record<
  SnapshotStatus,
  { label: string; tone: "pass" | "warn" | "block" | "escalate" | "neutral"; statusIcon: "pass" | "warn" | "block" | "escalate" }
> = {
  auto_approved: { label: "Auto-confirmed", tone: "pass", statusIcon: "pass" },
  approved: { label: "Approved by SA&E", tone: "pass", statusIcon: "pass" },
  permit_pending: { label: "Pending permit", tone: "warn", statusIcon: "warn" },
  pending_review: { label: "Needs staff review", tone: "escalate", statusIcon: "escalate" },
  denied: { label: "Rejected", tone: "block", statusIcon: "block" },
};

export function AdminQueue({ initialData }: AdminQueueProps) {
  const [data, setData] = useState<AdminResponse | null>(initialData ?? null);
  const [tab, setTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{
    snapshot: DecisionSnapshot;
    action: "approve" | "deny";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastNotification, setLastNotification] = useState<{
    clubName: string;
    action: "approve" | "deny";
    message: string;
    timestamp: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAdminData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin");
      if (res.ok) {
        const json = (await res.json()) as AdminResponse;
        setData(json);
      }
    } catch {
      // ignore network errors
    } finally {
      setRefreshing(false);
    }
  };

  const handleAction = async () => {
    if (!activeAction) return;
    setSubmitting(true);
    const { snapshot, action, message } = activeAction;
    const club = CLUB_BY_ID[snapshot.clubId]?.name ?? snapshot.clubId;

    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotId: snapshot.id,
          action,
          message: message.trim(),
        }),
      });

      if (res.ok) {
        setLastNotification({
          clubName: club,
          action,
          message: message.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        setActiveAction(null);
        await fetchAdminData();
      }
    } catch {
      // handle error
    } finally {
      setSubmitting(false);
    }
  };

  const startReject = (snap: DecisionSnapshot) => {
    const room = ROOM_BY_ID[snap.selectedRoomId]?.name ?? snap.selectedRoomId;
    const eventName = snap.facts.summary.value ?? snap.requestText ?? "Your event";
    const dateStr = snap.facts.date.value ? fmtDate(snap.facts.date.value) : "your requested date";
    const defaultMsg = `Notice from Student Activities & Events: Your booking for "${eventName}" in ${room} on ${dateStr} has been rejected. Reason: `;
    setActiveAction({
      snapshot: snap,
      action: "deny",
      message: defaultMsg,
    });
  };

  const startApprove = (snap: DecisionSnapshot) => {
    const room = ROOM_BY_ID[snap.selectedRoomId]?.name ?? snap.selectedRoomId;
    const eventName = snap.facts.summary.value ?? snap.requestText ?? "Your event";
    const dateStr = snap.facts.date.value ? fmtDate(snap.facts.date.value) : "your requested date";
    const defaultMsg = `Notice from Student Activities & Events: Your booking for "${eventName}" in ${room} on ${dateStr} has been reviewed and approved. Please ensure all campus safety policies and room reset guidelines are followed.`;
    setActiveAction({
      snapshot: snap,
      action: "approve",
      message: defaultMsg,
    });
  };

  const snapshots = data?.log ?? [];
  const counts = useMemo(() => {
    const auto = snapshots.filter((s) => s.status === "auto_approved").length;
    const pending = snapshots.filter((s) => s.status === "pending_review").length;
    const permit = snapshots.filter((s) => s.status === "permit_pending").length;
    const denied = snapshots.filter((s) => s.status === "denied").length;
    const approved = snapshots.filter((s) => s.status === "approved").length;
    return {
      auto,
      pending,
      permit,
      denied,
      approved,
      total: snapshots.length,
      hoursSaved: (auto * 15) / 60,
    };
  }, [snapshots]);

  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((s) => {
      // Tab filter
      if (tab === "auto" && s.status !== "auto_approved") return false;
      if (tab === "pending" && s.status !== "pending_review") return false;
      if (tab === "permit" && s.status !== "permit_pending") return false;
      if (tab === "denied" && s.status !== "denied") return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const club = (CLUB_BY_ID[s.clubId]?.name ?? s.clubId).toLowerCase();
        const short = (CLUB_BY_ID[s.clubId]?.short ?? "").toLowerCase();
        const room = (ROOM_BY_ID[s.selectedRoomId]?.name ?? s.selectedRoomId).toLowerCase();
        const summary = (s.facts.summary.value ?? s.requestText ?? "").toLowerCase();
        return club.includes(q) || short.includes(q) || room.includes(q) || summary.includes(q);
      }
      return true;
    });
  }, [snapshots, tab, search]);

  return (
    <div className="space-y-6">
      {/* Top Banner Alert when a message was just sent to the booking party */}
      {lastNotification && (
        <div
          role="alert"
          className="gs-rise flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                lastNotification.action === "approve"
                  ? "bg-pass-soft text-pass"
                  : "bg-block-soft text-block",
              )}
            >
              {lastNotification.action === "approve" ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4" aria-hidden />
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-ink">
                Confirmation sent to {lastNotification.clubName} at {lastNotification.timestamp}
              </p>
              <p className="text-xs text-muted">&ldquo;{lastNotification.message}&rdquo;</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastNotification(null)}
            className="rounded-full p-1 text-muted hover:bg-sunken hover:text-ink"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Metrics & Time Saved Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <SectionLabel>Auto-Confirmed</SectionLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-ink">{counts.auto}</span>
            <span className="text-xs text-pass font-medium">Auto-approved</span>
          </div>
          <p className="mt-1 text-xs text-muted">Zero staff touchpoints</p>
        </Card>

        <Card className="p-4">
          <SectionLabel>Needs Review</SectionLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-escalate">{counts.pending}</span>
            <span className="text-xs text-escalate font-medium">Tier 3 queue</span>
          </div>
          <p className="mt-1 text-xs text-muted">Prepared briefing attached</p>
        </Card>

        <Card className="p-4">
          <SectionLabel>Permit Assisted</SectionLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-warn">{counts.permit}</span>
            <span className="text-xs text-warn font-medium">Pre-filled</span>
          </div>
          <p className="mt-1 text-xs text-muted">EHS / Guest filings</p>
        </Card>

        <Card className="p-4 bg-accent-soft/40 border-accent/20">
          <SectionLabel className="text-accent">Time Saved</SectionLabel>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-accent">
              ~{counts.hoursSaved.toFixed(1)} hrs
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">Assumes 15 min manual triage</p>
        </Card>
      </div>

      {/* Control Bar: Filter Tabs & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === "all" ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
            )}
          >
            All Bookings ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setTab("auto")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === "auto" ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
            )}
          >
            Auto-Confirmed ({counts.auto})
          </button>
          <button
            type="button"
            onClick={() => setTab("pending")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === "pending" ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
            )}
          >
            Needs Review ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setTab("permit")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === "permit" ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
            )}
          >
            Permits ({counts.permit})
          </button>
          <button
            type="button"
            onClick={() => setTab("denied")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === "denied" ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line",
            )}
          >
            Rejected ({counts.denied})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search club, room, event..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 rounded-full border border-line bg-surface pl-8 pr-3 text-xs text-ink placeholder:text-muted outline-none focus:border-ink-2"
            />
          </div>
          <button
            type="button"
            onClick={fetchAdminData}
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-2 hover:bg-sunken disabled:opacity-50"
            title="Refresh queue"
            aria-label="Refresh queue"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Modal / Inline Drawer for Sending Approval / Rejection Message */}
      {activeAction && (
        <div
          role="dialog"
          aria-labelledby="message-dialog-title"
          className="gs-rise rounded-2xl border border-line-strong bg-surface p-5 shadow-lg space-y-4"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 id="message-dialog-title" className="text-base font-semibold text-ink">
                {activeAction.action === "approve"
                  ? `Approve & Send Confirmation to ${CLUB_BY_ID[activeAction.snapshot.clubId]?.name ?? activeAction.snapshot.clubId}`
                  : `Reject & Send Notice to ${CLUB_BY_ID[activeAction.snapshot.clubId]?.name ?? activeAction.snapshot.clubId}`}
              </h3>
              <p className="text-xs text-muted">
                {activeAction.action === "approve"
                  ? "This will confirm the reservation and dispatch your note to the student organization."
                  : "This will revoke/deny the room reservation and notify the student organization with your reason."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveAction(null)}
              className="rounded-full p-1 text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {activeAction.action === "deny" && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">Insert common rejection reason:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Maintenance / repair scheduled in room",
                  "Fire capacity exceeded for planned layout",
                  "Quiet hours policy in residential area",
                  "Priority university academic event override",
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() =>
                      setActiveAction((prev) =>
                        prev ? { ...prev, message: `${prev.message.trim()} ${reason}.` } : null,
                      )
                    }
                    className="rounded-full border border-line bg-subtle px-2.5 py-1 text-xs text-ink-2 hover:bg-sunken"
                  >
                    + {reason}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="admin-message-input" className="text-xs font-medium text-ink-2">
              Message to organization organizer
            </label>
            <textarea
              id="admin-message-input"
              rows={3}
              value={activeAction.message}
              onChange={(e) =>
                setActiveAction((prev) => (prev ? { ...prev, message: e.target.value } : null))
              }
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-ink-2"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setActiveAction(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={submitting || !activeAction.message.trim()}
              onClick={handleAction}
              className={activeAction.action === "deny" ? "bg-block hover:bg-block/90 text-white" : ""}
            >
              {submitting
                ? "Sending..."
                : activeAction.action === "approve"
                  ? "Approve & Send Confirmation"
                  : "Reject & Send Notice"}
            </Button>
          </div>
        </div>
      )}

      {/* Bookings List */}
      {filteredSnapshots.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          <Filter className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm">No bookings found for the selected view.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSnapshots.map((snap) => {
            const club = CLUB_BY_ID[snap.clubId];
            const room = ROOM_BY_ID[snap.selectedRoomId];
            const eventName = snap.facts.summary.value ?? snap.requestText ?? "Event";
            const dateStr = snap.facts.date.value ? fmtDate(snap.facts.date.value) : "TBD";
            const timeStr =
              snap.facts.startTime.value && snap.facts.endTime.value
                ? `${fmtTime(snap.facts.startTime.value)}–${fmtTime(snap.facts.endTime.value)}`
                : "Time TBD";
            const isExpanded = expandedId === snap.id;
            const statusConfig = STATUS_CONFIG[snap.status] ?? STATUS_CONFIG.auto_approved;

            return (
              <Card
                key={snap.id}
                className={cn(
                  "p-4 transition-all",
                  snap.status === "pending_review" && "border-escalate/30 bg-escalate-soft/20",
                  snap.status === "denied" && "opacity-80 bg-subtle",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Summary & Meta */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={statusConfig.tone} icon={<StatusIcon status={statusConfig.statusIcon} />}>
                        {statusConfig.label}
                      </Pill>
                      <Pill tone="neutral" className="font-medium">
                        {club ? `${club.short}` : snap.clubId}
                      </Pill>
                      <span className="text-xs text-muted font-mono">Tier {snap.tier}</span>
                      {snap.facts.headcount.value && (
                        <span className="text-xs text-muted">
                          · {snap.facts.headcount.value} attendees
                        </span>
                      )}
                    </div>

                    <h4 className="text-base font-semibold text-ink truncate">{eventName}</h4>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                      <span className="font-medium">{room?.name ?? snap.selectedRoomId}</span>
                      <span>·</span>
                      <span>
                        {dateStr} · {timeStr}
                      </span>
                      <span>·</span>
                      <span className="text-muted">
                        Recorded {new Date(snap.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Sent Notification Preview */}
                    {snap.adminMessage && (
                      <div className="mt-1 flex items-start gap-1.5 rounded-lg bg-sunken px-2.5 py-1 text-xs text-ink-2">
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted" />
                        <span>
                          <strong>Notice to {club?.short ?? "club"}:</strong> &ldquo;{snap.adminMessage}&rdquo;
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                      className="text-xs"
                    >
                      {isExpanded ? "Hide details" : "View details"}
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")}
                      />
                    </Button>

                    {/* Pending Review Actions */}
                    {snap.status === "pending_review" && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startReject(snap)}
                          className="text-xs text-block border-block/30 hover:bg-block-soft"
                        >
                          Reject
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => startApprove(snap)}
                          className="text-xs"
                        >
                          Approve
                        </Button>
                      </>
                    )}

                    {/* Auto-Confirmed / Permit-Pending: can be rejected/revoked */}
                    {(snap.status === "auto_approved" || snap.status === "permit_pending" || snap.status === "approved") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startReject(snap)}
                        className="text-xs text-block border-line hover:border-block/40 hover:bg-block-soft"
                      >
                        Reject / Revoke
                      </Button>
                    )}

                    {/* Already denied state */}
                    {snap.status === "denied" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startApprove(snap)}
                        className="text-xs hover:border-pass/40 hover:bg-pass-soft"
                      >
                        Re-open / Approve
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expandable Details & Audit Section */}
                {isExpanded && (
                  <div className="gs-rise mt-4 space-y-4 border-t border-line pt-4 text-xs">
                    {/* Event Description Text */}
                    {snap.requestText && (
                      <div className="space-y-1">
                        <SectionLabel>Original Request Description</SectionLabel>
                        <p className="rounded-lg bg-sunken p-2.5 text-sm text-ink-2">
                          &ldquo;{snap.requestText}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* AI Briefing (Tier 3) or Explanation */}
                    {snap.writer && (
                      <div className="space-y-2 rounded-xl bg-subtle p-3 border border-line">
                        <SectionLabel>GatorSpace Briefing &amp; Assessment</SectionLabel>
                        <p className="text-sm font-medium text-ink">{snap.writer.headline}</p>
                        <p className="text-xs leading-relaxed text-ink-2">{snap.writer.explanation}</p>

                        {snap.writer.briefing?.riskPoints && (
                          <div className="space-y-1 pt-1">
                            <span className="font-semibold text-ink">Risk evaluation points:</span>
                            <ul className="list-disc list-inside space-y-0.5 text-ink-2">
                              {snap.writer.briefing.riskPoints.map((rp, i) => (
                                <li key={i}>
                                  <strong>{rp.ruleId}:</strong> {rp.point}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* User Corrections vs AI Values */}
                    {snap.userCorrections.length > 0 && (
                      <div className="space-y-1">
                        <SectionLabel>Officer Corrections (Audit Trail)</SectionLabel>
                        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
                          {snap.userCorrections.map((uc, i) => (
                            <div key={i} className="flex items-center justify-between p-2">
                              <span className="font-medium text-ink-2">{FACT_LABEL[uc.field]}</span>
                              <div className="flex items-center gap-1.5 text-muted">
                                <span>{String(uc.aiValue ?? "unknown")}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-semibold text-accent">{String(uc.userValue)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Structured Facts Grid */}
                    <div className="space-y-1">
                      <SectionLabel>Policy Attributes Checked</SectionLabel>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(
                          [
                            "food",
                            "amplifiedSound",
                            "externalGuests",
                            "guestSpeakers",
                            "alcohol",
                            "minors",
                            "avNeeds",
                            "layout",
                          ] as FactField[]
                        ).map((field) => (
                          <div key={field} className="rounded-lg bg-sunken p-2">
                            <div className="text-[10px] text-muted">{FACT_LABEL[field]}</div>
                            <div className="font-medium text-ink">
                              {fmtFactValue(field, snap.facts[field].value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notification History */}
                    {snap.messageHistory && snap.messageHistory.length > 0 && (
                      <div className="space-y-1">
                        <SectionLabel>Notification History to Booking Party</SectionLabel>
                        <div className="space-y-1">
                          {snap.messageHistory.map((m, i) => (
                            <div key={i} className="rounded-lg border border-line bg-surface p-2">
                              <div className="flex items-center justify-between text-[11px] text-muted">
                                <span className="font-semibold capitalize text-ink">{m.action} Notice</span>
                                <span>{new Date(m.sentAt).toLocaleString()}</span>
                              </div>
                              <p className="mt-1 text-ink-2">&ldquo;{m.text}&rdquo;</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
