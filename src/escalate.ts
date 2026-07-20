import { bumpTier, type Directive } from "./directive.ts";

export type EscalationState = {
  attempts: number;
  widened: boolean;
  tier: string;
  bumps: number;
};

export type EscalationAction =
  | { kind: "retry"; widen: boolean; tier: string; reason: string }
  | { kind: "stop"; reason: string };

export function nextEscalation(
  directive: Directive,
  state: EscalationState,
): EscalationAction {
  const { widen_after, escalate_after } = directive.escalation;
  const nextAttempts = state.attempts + 1;

  if (nextAttempts === widen_after && !state.widened) {
    return {
      kind: "retry",
      widen: true,
      tier: state.tier,
      reason: `verify failed → widen context (attempt ${nextAttempts})`,
    };
  }

  if (nextAttempts >= escalate_after && state.bumps < 1) {
    const bumped = bumpTier(directive, state.tier);
    if (bumped) {
      return {
        kind: "retry",
        widen: true,
        tier: bumped,
        reason: `verify failed → escalate ${state.tier} → ${bumped}`,
      };
    }
  }

  return {
    kind: "stop",
    reason: `verify failed after ${nextAttempts} attempt(s); no further escalation`,
  };
}
