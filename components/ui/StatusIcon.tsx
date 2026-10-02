import { CircleAlert, CircleCheck, CircleHelp, CircleX, FileText, ShieldAlert } from "lucide-react";
import type { RuleStatus } from "@/lib/types";
import { cn } from "@/lib/client/cn";

const MAP: Record<RuleStatus, { Icon: typeof CircleCheck; color: string; label: string }> = {
  pass: { Icon: CircleCheck, color: "text-pass", label: "Passes" },
  warn: { Icon: CircleAlert, color: "text-warn", label: "Warning" },
  block: { Icon: CircleX, color: "text-block", label: "Blocked" },
  permit: { Icon: FileText, color: "text-warn", label: "Permit required" },
  escalate: { Icon: ShieldAlert, color: "text-escalate", label: "Staff review" },
  info: { Icon: CircleHelp, color: "text-info", label: "Needs info" },
};

/** Icon + color + aria-label for a rule status. Never signal status with color alone. */
export function StatusIcon({ status, className }: { status: RuleStatus; className?: string }) {
  const { Icon, color, label } = MAP[status];
  return <Icon role="img" aria-label={label} className={cn("h-4 w-4 shrink-0", color, className)} />;
}

/** Pill tone matching each status. */
export const STATUS_TONE: Record<RuleStatus, "pass" | "warn" | "block" | "escalate" | "neutral"> = {
  pass: "pass",
  warn: "warn",
  block: "block",
  permit: "warn",
  escalate: "escalate",
  info: "neutral",
};
