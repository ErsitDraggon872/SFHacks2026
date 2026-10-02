import { describe, expect, it } from "vitest";
import { POST as triageHandler } from "../app/api/triage/route";
import type { TriageResponse } from "../lib/types";

async function postTriage(body: Record<string, unknown>): Promise<{ status: number; data: TriageResponse & { error?: string } }> {
  const req = new Request("http://localhost:3000/api/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await triageHandler(req);
  const data = await res.json();
  return { status: res.status, data };
}

describe("POST /api/triage — Route Integration Tests", () => {
  it("rejects request without clubId", async () => {
    const { status, data } = await postTriage({ text: "some event" });
    expect(status).toBe(400);
    expect(data.error).toContain("clubId is required");
  });

  it("rejects request without text or presetId", async () => {
    const { status, data } = await postTriage({ clubId: "acm" });
    expect(status).toBe(400);
    expect(data.error).toContain("Provide text or presetId");
  });

  it("handles 'study' preset (Tier 1 auto-approvable)", async () => {
    const { status, data } = await postTriage({ clubId: "study", presetId: "study" });
    expect(status).toBe(200);
    expect(data.presetId).toBe("study");
    expect(data.decision.tier).toBe(1);
    expect(data.ranked.length).toBeGreaterThan(0);
    expect(data.aiMode).toBe("cached");
    expect(data.writer).toBeNull(); // Tier 1 needs no writer explanation
  });

  it("handles 'pizza' hero preset (Tier 2 conflict with Fix It)", async () => {
    const { status, data } = await postTriage({ clubId: "acm", presetId: "pizza" });
    expect(status).toBe(200);
    expect(data.presetId).toBe("pizza");
    expect(data.decision.tier).toBe(2);
    expect(data.decision.suggestedRoomId).toBe("CCSC-204");
    expect(data.writer).not.toBeNull();
    expect(data.writer?.headline).toContain("move to a room that allows food");
    expect(data.writer?.permitNarrative).toBeTruthy();
    expect(data.aiMode).toBe("cached");
  });

  it("handles 'speaker' preset (Tier 3 escalated review)", async () => {
    const { status, data } = await postTriage({ clubId: "premed", presetId: "speaker" });
    expect(status).toBe(200);
    expect(data.presetId).toBe("speaker");
    expect(data.decision.tier).toBe(3);
    expect(data.writer).not.toBeNull();
    expect(data.writer?.briefing).not.toBeNull();
    expect(data.writer?.briefing?.summary).toBeTruthy();
    expect(data.writer?.briefing?.riskPoints.length).toBeGreaterThan(0);
  });

  it("handles 'dance' preset (Tier 2 sound curfew)", async () => {
    const { status, data } = await postTriage({ clubId: "dance", presetId: "dance" });
    expect(status).toBe(200);
    expect(data.presetId).toBe("dance");
    expect(data.decision.tier).toBe(2);
    expect(data.writer?.headline).toContain("sound-isolated studio");
  });

  it("handles free-text 'networking dinner for 80' with key unset, returning clarifying questions", async () => {
    const { status, data } = await postTriage({ clubId: "sfhacks", text: "networking dinner for 80" });
    expect(status).toBe(200);
    expect(data.draft).not.toBeNull();
    expect(data.draft?.headcount).toBe(80);
    expect(data.draft?.missingRequiredFields).toEqual(expect.arrayContaining(["date", "startTime", "endTime"]));
    expect(data.draft?.ambiguities.length).toBeGreaterThanOrEqual(2);
    expect(data.decision.canAutoApprove).toBe(false);
    expect(data.aiMode).toBe("fallback");
  });
});
