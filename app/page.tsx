"use client";
/**
 * Request page — OWNER: C1 (layout + wiring). Components marked C2 are filled in by Computer 2;
 * their props are already wired here, so C2 only edits component bodies.
 */
import { AiModeBadge } from "@/components/AiModeBadge";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { ClarifyingQuestions } from "@/components/ClarifyingQuestions";
import { ClubSwitcher } from "@/components/ClubSwitcher";
import { ComplianceChecklist } from "@/components/ComplianceChecklist";
import { ConfirmBar } from "@/components/ConfirmBar";
import { FactChips } from "@/components/FactChips";
import { PermitDraft } from "@/components/PermitDraft";
import { PolicyBanner } from "@/components/PolicyBanner";
import { PolicyExcerptModal } from "@/components/PolicyExcerptModal";
import { QuickFilters } from "@/components/QuickFilters";
import { QuotaMeter } from "@/components/QuotaMeter";
import { ResultsList } from "@/components/ResultsList";
import { SearchHero } from "@/components/SearchHero";
import { TierPanel } from "@/components/TierPanel";
import { TopBar } from "@/components/TopBar";
import { Button, Disclosure } from "@/components/ui";
import { useBookingFlow } from "@/lib/client/useBookingFlow";
import { CLUBS } from "@/lib/data";
import { PRESETS } from "@/lib/presets";
import { DAILY_CAP_MIN } from "@/lib/types";

export default function Home() {
  const s = useBookingFlow();
  const d = s.decision;

  return (
    <>
      <TopBar
        right={
          <>
            <QuotaMeter usedMin={d && s.facts?.date.value ? d.clubMinutesUsed : null} requestMin={d?.requestMinutes ?? null} capMin={DAILY_CAP_MIN} date={s.facts?.date.value} />
            <ClubSwitcher clubs={CLUBS} clubId={s.clubId} onChange={s.setClubId} />
          </>
        }
      />
      <PolicyBanner />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24">
        {s.confirmation && <BookingConfirmation data={s.confirmation} onDone={s.dismissConfirmation} />}

        <SearchHero
          mode={s.mode}
          onMode={s.setMode}
          text={s.text}
          onText={s.setText}
          onSubmit={s.runText}
          presets={PRESETS}
          onPreset={s.runPreset}
          loading={s.phase === "loading"}
          compact={s.phase !== "idle"}
          filters={<QuickFilters value={s.filterFacts} onChange={s.setFilterFacts} onSubmit={s.runFilters} />}
          footer={
            <div className="flex items-center gap-3">
              <AiModeBadge mode={s.aiMode} />
              {s.phase !== "idle" && (
                <Button variant="ghost" size="sm" onClick={s.reset}>
                  Start over
                </Button>
              )}
            </div>
          }
        />

        {s.error && (
          <p role="alert" className="mt-4 rounded-xl bg-block-soft px-4 py-3 text-sm text-block">
            {s.error}
          </p>
        )}

        {s.phase === "loading" && (
          <div className="mt-8 space-y-3" aria-busy="true" aria-label="Checking policy and rooms">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-sunken" />
            ))}
          </div>
        )}

        {s.phase === "results" && s.facts && d && (
          <div className="gs-rise mt-6 space-y-5">
            <TierPanel
              decision={d}
              targetRoom={s.targetRoom}
              suggestedRoom={s.suggestedRoom}
              writer={s.writer}
              attested={s.attested}
              onAttest={s.setAttested}
              onFix={s.fix}
              onSubmit={s.submit}
              submitting={s.submitting}
              result={s.result}
              showActions={false}
            />

            <FactChips facts={s.facts} original={s.original} onEdit={s.edit} />

            {d.unresolved.length > 0 && (
              <ClarifyingQuestions
                questions={d.unresolved}
                ambiguities={s.response?.draft?.ambiguities ?? []}
                facts={s.facts}
                onAnswer={s.edit}
              />
            )}

            <ResultsList ranked={s.ranked} targetRoomId={d.targetRoomId} onSelect={s.selectRoom} />

            {d.permitsRequired.map((p) => (
              <PermitDraft key={p.permitId} permit={p} narrative={s.writer?.permitNarrative ?? null} />
            ))}

            <Disclosure summary={`Policy checklist · ${d.applicableRules.length} rules checked`}>
              <ComplianceChecklist results={d.applicableRules} onCite={s.setCiteRuleId} />
            </Disclosure>

            {/* commit step last: decide → choose room → review permit → attest + book */}
            <ConfirmBar
              decision={d}
              targetRoom={s.targetRoom}
              attested={s.attested}
              onAttest={s.setAttested}
              eventName={s.eventName}
              onEventName={s.setEventName}
              eventDescription={s.eventDescription}
              onEventDescription={s.setEventDescription}
              onSubmit={s.submit}
              submitting={s.submitting}
              result={s.result}
            />
          </div>
        )}
      </main>

      <PolicyExcerptModal ruleId={s.citeRuleId} onClose={() => s.setCiteRuleId(null)} />
    </>
  );
}
