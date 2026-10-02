"use client";
/**
 * /admin — SA&E Review Queue & Audit Portal. OWNER: C3.
 * Features:
 *   - Pending Tier 3 briefings with Approve/Deny actions (POST /api/admin)
 *   - Metrics cards: Auto-approved, Permit-assisted, Escalated
 *   - Labeled estimate of manual review time avoided (N × assumed 15 min)
 *   - Decision snapshot audit log with visual AI vs. User correction diffs
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { PolicyBanner } from "@/components/PolicyBanner";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { Card, SectionLabel } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { CLUBS } from "@/lib/data";
import type { AdminResponse } from "@/lib/types";

const CLUB_MAP = Object.fromEntries(CLUBS.map((c) => [c.id, c.name]));

type FilterTab = "all" | "pending" | "auto_approved" | "permit_pending" | "resolved";

export default function AdminPage() {
  const [data, setData] = useState<AdminResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSnapId, setExpandedSnapId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [feedbackMsg, setFeedbackMsg] = useState<{ id: string; text: string; type: "success" | "error" } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin");
      if (res.ok) {
        const json: AdminResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load admin queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleAction = async (snapshotId: string, action: "approve" | "deny") => {
    setActionLoading(snapshotId);
    setFeedbackMsg(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId, action }),
      });
      if (res.ok) {
        setFeedbackMsg({
          id: snapshotId,
          text: `Request ${action === "approve" ? "approved" : "denied"} successfully.`,
          type: "success",
        });
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedbackMsg({
          id: snapshotId,
          text: err.error || "Action failed.",
          type: "error",
        });
      }
    } catch {
      setFeedbackMsg({
        id: snapshotId,
        text: "Network error occurred.",
        type: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const counts = data?.counts ?? { autoApproved: 0, permitAssisted: 0, escalated: 0 };
  const totalRoutine = counts.autoApproved + counts.permitAssisted;
  const assumedMinPerRequest = 15;
  const minutesAvoided = totalRoutine * assumedMinPerRequest;
  const hoursAvoided = (minutesAvoided / 60).toFixed(1);

  const filteredLog = useMemo(() => {
    if (!data?.log) return [];
    if (activeTab === "pending") return data.log.filter((s) => s.status === "pending_review");
    if (activeTab === "auto_approved") return data.log.filter((s) => s.status === "auto_approved");
    if (activeTab === "permit_pending") return data.log.filter((s) => s.status === "permit_pending");
    if (activeTab === "resolved") return data.log.filter((s) => s.status === "approved" || s.status === "denied");
    return data.log;
  }, [data?.log, activeTab]);

  const pendingList = data?.pending ?? [];

  return (
    <>
      <TopBar
        right={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchData()}
            disabled={loading}
            className="text-xs text-muted hover:text-ink"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <PolicyBanner />

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Student Activities & Events</p>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-ink">SA&amp;E Review Queue &amp; Audit</h1>
            <p className="mt-1 text-sm text-muted">
              Explainable triage oversight: routine bookings auto-cleared, paperwork pre-filled, escalations briefed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              <span>← Back to Student Portal</span>
            </Link>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 bg-surface">
            <div className="flex items-center justify-between">
              <SectionLabel>Auto-Approved</SectionLabel>
              <Pill tone="pass" icon={<CheckCircle2 className="h-3 w-3" />}>
                Tier 1
              </Pill>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink">{counts.autoApproved}</span>
              <span className="text-xs text-muted">events</span>
            </div>
            <p className="mt-1 text-xs text-muted">Resolved policy &amp; capacity checks with zero staff touch.</p>
          </Card>

          <Card className="p-4 bg-surface">
            <div className="flex items-center justify-between">
              <SectionLabel>Permit-Assisted</SectionLabel>
              <Pill tone="warn" icon={<FileCheck2 className="h-3 w-3" />}>
                Tier 2
              </Pill>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink">{counts.permitAssisted}</span>
              <span className="text-xs text-muted">forms pre-filled</span>
            </div>
            <p className="mt-1 text-xs text-muted">Food/speaker permits prepared with room conflict resolution.</p>
          </Card>

          <Card className="p-4 bg-surface">
            <div className="flex items-center justify-between">
              <SectionLabel>Escalated Review</SectionLabel>
              <Pill tone="escalate" icon={<ShieldAlert className="h-3 w-3" />}>
                Tier 3
              </Pill>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink">{counts.escalated}</span>
              <span className="text-xs text-muted">{pendingList.length} pending</span>
            </div>
            <p className="mt-1 text-xs text-muted">High-impact events packaged with an AI staff briefing.</p>
          </Card>

          <Card className="p-4 bg-accent-soft/40 border-accent/20">
            <div className="flex items-center justify-between">
              <SectionLabel className="text-accent font-semibold">Review Avoided</SectionLabel>
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-accent">≈ {hoursAvoided}</span>
              <span className="text-xs font-medium text-accent">hours</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Estimated: {totalRoutine} routine requests × assumed {assumedMinPerRequest} min review each.
            </p>
          </Card>
        </div>

        {/* Section 1: Pending Tier 3 Queue */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Tier 3 Action Queue</h2>
              <span className="inline-flex items-center justify-center rounded-full bg-escalate-soft px-2.5 py-0.5 text-xs font-semibold text-escalate">
                {pendingList.length} pending
              </span>
            </div>
            <span className="text-xs text-muted">Events requiring manual SA&amp;E sign-off</span>
          </div>

          <div className="mt-4 space-y-4">
            {pendingList.length === 0 ? (
              <Card className="p-8 text-center bg-subtle/50 border-dashed">
                <CheckCircle2 className="mx-auto h-8 w-8 text-pass" />
                <h3 className="mt-2 text-sm font-semibold text-ink">Review Queue Clear</h3>
                <p className="mt-1 text-xs text-muted">No pending Tier 3 events currently require staff determination.</p>
              </Card>
            ) : (
              pendingList.map((snap) => {
                const briefing = snap.writer?.briefing;
                const clubName = CLUB_MAP[snap.clubId] || snap.clubId;
                const isWorking = actionLoading === snap.id;

                return (
                  <Card key={snap.id} className="overflow-hidden border-line-strong shadow-xs">
                    {/* Header bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/40 px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Pill tone="escalate" icon={<ShieldAlert className="h-3 w-3" />}>
                          Tier 3 · Staff Review
                        </Pill>
                        <span className="text-sm font-semibold text-ink">{clubName}</span>
                        <span className="text-xs text-muted">· Room: {snap.selectedRoomId}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{new Date(snap.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>

                    <div className="p-5">
                      {/* Original Request Quote */}
                      <div className="rounded-xl border border-line bg-surface p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Submitted Request Text
                          </span>
                          <span className="text-xs text-muted">
                            {snap.facts.date.value} ({snap.facts.startTime.value}–{snap.facts.endTime.value}) · Headcount: {snap.facts.headcount.value}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm italic text-ink-2">&ldquo;{snap.requestText}&rdquo;</p>
                      </div>

                      {/* AI Briefing for Staff */}
                      {briefing && (
                        <div className="mt-4 rounded-xl border border-escalate/20 bg-escalate-soft/30 p-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-escalate" />
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-escalate">
                              Automated SA&amp;E Staff Briefing
                            </h4>
                          </div>

                          <p className="mt-2 text-sm text-ink-2 font-medium">{briefing.summary}</p>

                          {/* Risk Points */}
                          {briefing.riskPoints && briefing.riskPoints.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              <span className="text-xs font-semibold text-ink">Identified Policy Triggers:</span>
                              <div className="grid grid-cols-1 gap-2 pt-1">
                                {briefing.riskPoints.map((rp, idx) => (
                                  <div key={idx} className="flex items-start gap-2 text-xs text-ink-2">
                                    <Pill tone="escalate" className="shrink-0 text-[10px] py-0 px-1.5">
                                      {rp.ruleId}
                                    </Pill>
                                    <span>{rp.point}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Staff Clarifying Questions */}
                          {briefing.staffQuestions && briefing.staffQuestions.length > 0 && (
                            <div className="mt-3.5 pt-3 border-t border-escalate/20">
                              <span className="text-xs font-semibold text-ink">Recommended Inquiries for Officer:</span>
                              <ul className="mt-1 list-disc list-inside space-y-1 text-xs text-ink-2">
                                {briefing.staffQuestions.map((q, idx) => (
                                  <li key={idx}>{q}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status feedback message if any */}
                      {feedbackMsg?.id === snap.id && (
                        <div
                          className={`mt-4 rounded-lg p-2.5 text-xs font-medium ${
                            feedbackMsg.type === "success" ? "bg-pass-soft text-pass" : "bg-block-soft text-block"
                          }`}
                        >
                          {feedbackMsg.text}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
                        <div className="text-xs text-muted">
                          Snapshot ID: <code className="font-mono text-[11px]">{snap.id}</code>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isWorking}
                            onClick={() => void handleAction(snap.id, "deny")}
                            className="hover:border-block hover:text-block text-xs"
                          >
                            <X className="h-3.5 w-3.5 text-block" />
                            Deny Request
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isWorking}
                            onClick={() => void handleAction(snap.id, "approve")}
                            className="bg-accent hover:bg-accent/90 text-xs"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve Booking
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        {/* Section 2: Decision Snapshot Audit Log */}
        <section className="mt-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">Decision Snapshot Audit Log</h2>
              <p className="text-xs text-muted">Complete audit trail capturing AI extractions vs. user modifications.</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 rounded-full border border-line bg-sunken/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  activeTab === "all" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                All ({data?.log.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  activeTab === "pending" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Pending ({pendingList.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("auto_approved")}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  activeTab === "auto_approved" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Auto ({counts.autoApproved})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("permit_pending")}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  activeTab === "permit_pending" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Permit ({counts.permitAssisted})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("resolved")}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  activeTab === "resolved" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Decided
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredLog.length === 0 ? (
              <Card className="p-8 text-center text-xs text-muted bg-subtle/40 border-dashed">
                No decision snapshots found matching the selected filter.
              </Card>
            ) : (
              filteredLog.map((snap) => {
                const isExpanded = expandedSnapId === snap.id;
                const clubName = CLUB_MAP[snap.clubId] || snap.clubId;
                const hasCorrections = snap.userCorrections && snap.userCorrections.length > 0;

                const statusPill = (() => {
                  switch (snap.status) {
                    case "auto_approved":
                      return <Pill tone="pass">Auto-Approved</Pill>;
                    case "approved":
                      return <Pill tone="pass">Staff Approved</Pill>;
                    case "permit_pending":
                      return <Pill tone="warn">Permit Pending</Pill>;
                    case "pending_review":
                      return <Pill tone="escalate">Pending Review</Pill>;
                    case "denied":
                      return <Pill tone="block">Denied</Pill>;
                    default:
                      return <Pill tone="neutral">{snap.status}</Pill>;
                  }
                })();

                return (
                  <Card key={snap.id} className="transition-all hover:border-line-strong">
                    <div
                      className="cursor-pointer p-4 select-none"
                      onClick={() => setExpandedSnapId(isExpanded ? null : snap.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm text-ink">{clubName}</span>
                          <span className="text-xs text-muted">· {snap.selectedRoomId}</span>
                          <Pill tone={snap.tier === 1 ? "pass" : snap.tier === 2 ? "warn" : "escalate"}>
                            Tier {snap.tier}
                          </Pill>
                          {statusPill}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span>
                            {new Date(snap.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>

                      {/* Request Summary snippet */}
                      <p className="mt-2 text-xs text-muted line-clamp-1 italic">&ldquo;{snap.requestText}&rdquo;</p>

                      {/* User correction summary tag */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {hasCorrections ? (
                          <div className="inline-flex items-center gap-1.5 rounded-md bg-warn-soft/80 px-2 py-0.5 text-[11px] font-medium text-warn">
                            <span>User modified {snap.userCorrections.length} field(s)</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-faint">No corrections (AI accepted verbatim)</span>
                        )}

                        {snap.matchedRules.length > 0 && (
                          <div className="flex items-center gap-1">
                            {snap.matchedRules.map((rid) => (
                              <Pill key={rid} tone="neutral" className="text-[10px] py-0 px-1.5">
                                {rid}
                              </Pill>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="border-t border-line bg-subtle/40 p-5 space-y-4 text-xs">
                        {/* Human vs AI Diff Section */}
                        <div>
                          <SectionLabel className="text-ink font-semibold">AI Extraction vs. User Correction Diff</SectionLabel>
                          {hasCorrections ? (
                            <div className="mt-2 rounded-xl border border-line bg-surface overflow-hidden">
                              <table className="w-full text-left">
                                <thead className="border-b border-line bg-sunken/50 text-[11px] font-semibold text-muted">
                                  <tr>
                                    <th className="px-3.5 py-2">Field</th>
                                    <th className="px-3.5 py-2">AI Extraction</th>
                                    <th className="px-3.5 py-2">User Corrected Value</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-line text-ink-2">
                                  {snap.userCorrections.map((c, i) => (
                                    <tr key={i} className="hover:bg-subtle/50">
                                      <td className="px-3.5 py-2 font-mono font-medium text-ink">{c.field}</td>
                                      <td className="px-3.5 py-2 text-muted">
                                        <span className="line-through">{JSON.stringify(c.aiValue) ?? "null"}</span>
                                      </td>
                                      <td className="px-3.5 py-2 font-semibold text-pass">
                                        {JSON.stringify(c.userValue)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="mt-1 text-muted">
                              The officer did not modify any extracted values prior to confirming the booking.
                            </p>
                          )}
                        </div>

                        {/* Writer output snippet if available */}
                        {snap.writer && (
                          <div>
                            <SectionLabel className="text-ink font-semibold">AI Writer Output</SectionLabel>
                            <div className="mt-1.5 rounded-xl border border-line bg-surface p-3 space-y-1.5">
                              <div className="font-semibold text-ink">{snap.writer.headline}</div>
                              <p className="text-ink-2">{snap.writer.explanation}</p>
                              {snap.writer.permitNarrative && (
                                <div className="mt-2 rounded-lg bg-warn-soft/50 p-2 text-ink-2">
                                  <span className="font-semibold text-[11px] uppercase tracking-wider text-warn block mb-1">
                                    Pre-filled Permit Narrative
                                  </span>
                                  {snap.writer.permitNarrative}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Audit Details */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line text-[11px] text-muted">
                          <span>Booking ID: <code className="font-mono">{snap.bookingId}</code></span>
                          <span>Timestamp: {snap.createdAt}</span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </section>
      </main>
    </>
  );
}

