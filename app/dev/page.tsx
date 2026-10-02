"use client";
/**
 * /dev — component gallery. OWNER: C1.
 * Renders every C2 component against each fixture so components can be built one at a time.
 * Handlers just log to the console.
 */
import { useState } from "react";
import { AiModeBadge } from "@/components/AiModeBadge";
import { ClarifyingQuestions } from "@/components/ClarifyingQuestions";
import { ClubSwitcher } from "@/components/ClubSwitcher";
import { ComplianceChecklist } from "@/components/ComplianceChecklist";
import { FactChips } from "@/components/FactChips";
import { PermitDraft } from "@/components/PermitDraft";
import { PolicyBanner } from "@/components/PolicyBanner";
import { PolicyExcerptModal } from "@/components/PolicyExcerptModal";
import { QuickFilters } from "@/components/QuickFilters";
import { QuotaMeter } from "@/components/QuotaMeter";
import { RoomCard } from "@/components/RoomCard";
import { TierPanel } from "@/components/TierPanel";
import { Button, Card, SectionLabel, Segmented } from "@/components/ui";
import { FIXTURES, type FixtureName } from "@/lib/client/triageClient";
import { initialFilterFacts } from "@/lib/client/useBookingFlow";
import { CLUBS, ROOM_BY_ID } from "@/lib/data";
import type { CreateBookingResult } from "@/lib/types";

const log = (name: string) => (...args: unknown[]) => console.log(`[dev] ${name}`, ...args);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

export default function DevGallery() {
  const [name, setName] = useState<FixtureName>("pizza");
  const [attested, setAttested] = useState(false);
  const [cite, setCite] = useState<string | null>(null);
  const [filters, setFilters] = useState(initialFilterFacts);
  const t = FIXTURES[name];
  const d = t.decision;
  const best = t.ranked.find((r) => r.rank === 1);
  const row = t.ranked.find((r) => r.rank === 2);
  const unavailable = t.ranked.find((r) => r.rank === null);
  const okResult: CreateBookingResult | null = d.targetRoomId
    ? {
        ok: true,
        decision: d,
        booking: {
          id: "bk-demo",
          roomId: d.targetRoomId,
          clubId: "acm",
          date: t.facts.date.value ?? "2026-10-08",
          startTime: t.facts.startTime.value ?? "18:00",
          endTime: t.facts.endTime.value ?? "21:00",
          durationMin: d.requestMinutes ?? 60,
          status: d.tier === 3 ? "pending_review" : d.permitsRequired.length ? "pending_permit" : "confirmed",
          title: t.facts.summary.value ?? "Event",
          tier: d.tier,
          snapshotId: null,
          createdAt: new Date().toISOString(),
        },
      }
    : null;
  const errResult: CreateBookingResult = {
    ok: false,
    decision: d,
    errors: [{ ruleId: "BOOK-01", effect: "BLOCK_ROOM", scope: "room", message: "Already booked 18:00–20:00" }],
  };

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Component gallery</h1>
        <p className="text-sm text-muted">
          Every C2 component with fixture data. Edit a component body, save, and it updates here. Handlers log to the console.
        </p>
        <Segmented
          label="Fixture"
          value={name}
          onChange={setName}
          options={(Object.keys(FIXTURES) as FixtureName[]).map((k) => ({ value: k, label: k }))}
        />
        <p className="text-sm text-ink-2">
          Tier {d.tier} · {d.headline}
        </p>
      </header>

      <Section title="FactChips">
        <FactChips facts={t.facts} original={t.facts} onEdit={log("onEdit")} />
      </Section>

      <Section title="ClarifyingQuestions (speaker fixture has one)">
        {d.unresolved.length ? (
          <ClarifyingQuestions questions={d.unresolved} ambiguities={t.draft?.ambiguities ?? []} facts={t.facts} onAnswer={log("onAnswer")} />
        ) : (
          <p className="text-sm text-faint">No unresolved fields in this fixture.</p>
        )}
      </Section>

      <Section title="TierPanel — before submit">
        <TierPanel
          decision={{ ...d, canSubmit: d.canSubmit || attested }}
          targetRoom={d.targetRoomId ? ROOM_BY_ID[d.targetRoomId] : null}
          suggestedRoom={d.suggestedRoomId ? ROOM_BY_ID[d.suggestedRoomId] : null}
          writer={t.writer}
          attested={attested}
          onAttest={setAttested}
          onFix={log("onFix")}
          onSubmit={log("onSubmit")}
          submitting={false}
          result={null}
        />
      </Section>

      <Section title="TierPanel — after submit (ok / server rejected)">
        {okResult && (
          <TierPanel decision={d} targetRoom={ROOM_BY_ID[d.targetRoomId!]} suggestedRoom={null} writer={t.writer} attested onAttest={log("onAttest")} onFix={log("onFix")} onSubmit={log("onSubmit")} submitting={false} result={okResult} />
        )}
        <TierPanel decision={d} targetRoom={d.targetRoomId ? ROOM_BY_ID[d.targetRoomId] : null} suggestedRoom={null} writer={t.writer} attested onAttest={log("onAttest")} onFix={log("onFix")} onSubmit={log("onSubmit")} submitting={false} result={errResult} />
      </Section>

      <Section title="ComplianceChecklist">
        <ComplianceChecklist results={d.applicableRules} onCite={setCite} />
      </Section>

      <Section title="RoomCard — best / row / unavailable">
        {best && <RoomCard ranked={best} variant="best" isTarget={best.room.id === d.targetRoomId} onSelect={log("onSelect")} />}
        {row && <RoomCard ranked={row} variant="row" isTarget={false} onSelect={log("onSelect")} />}
        {unavailable && <RoomCard ranked={unavailable} variant="unavailable" isTarget={false} onSelect={log("onSelect")} />}
      </Section>

      <Section title="PermitDraft">
        {d.permitsRequired.length ? (
          d.permitsRequired.map((p) => <PermitDraft key={p.permitId} permit={p} narrative={t.writer?.permitNarrative ?? null} />)
        ) : (
          <p className="text-sm text-faint">No permits in this fixture (try pizza or speaker).</p>
        )}
      </Section>

      <Section title="QuickFilters">
        <Card className="p-4">
          <QuickFilters value={filters} onChange={setFilters} onSubmit={log("onSubmit")} />
        </Card>
      </Section>

      <Section title="Top bar bits">
        <div className="flex flex-wrap items-center gap-3">
          <ClubSwitcher clubs={CLUBS} clubId="acm" onChange={log("onChange")} />
          <QuotaMeter usedMin={d.clubMinutesUsed} requestMin={d.requestMinutes} capMin={d.clubMinutesCap} />
          <QuotaMeter usedMin={120} requestMin={180} capMin={180} />
          <QuotaMeter usedMin={null} requestMin={null} capMin={180} />
          <AiModeBadge mode="live" />
          <AiModeBadge mode="fallback" />
        </div>
      </Section>

      <Section title="PolicyBanner">
        <PolicyBanner />
      </Section>

      <Section title="PolicyExcerptModal">
        <Button variant="secondary" onClick={() => setCite("FOOD-01")}>
          Open FOOD-01
        </Button>
        <PolicyExcerptModal ruleId={cite} onClose={() => setCite(null)} />
      </Section>
    </main>
  );
}
