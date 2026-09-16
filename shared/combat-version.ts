import { V7_RULESET_ID, type SimulationRulesetId } from './simulation';
import type { V8RulesetId } from './simulation-v8';
import { V9_RULESET_ID } from './simulation-v9';

/** Historical coordinator default; normal V10 routing uses the runtime profile. */
export const CURRENT_COMBAT_RULESET_ID = V7_RULESET_ID;
export type CombatRulesetId = SimulationRulesetId | V8RulesetId | typeof V9_RULESET_ID;
// Reserved A6 identity only. No V8 automated policy is implemented in B.
export const V8_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v3' as const;
export const V8_LOOMKEEPER_PROFILE_ID = 'standard-v8-0' as const;
/** Required provenance for D's automated r1 envelope; reserved labels alone are not proof. */
export const V8_AUTOMATION_ID = 'wp-015d3a-v8d-r1-v1' as const;
/** Strict V9D provenance; the numeric V9 replay version remains unchanged. */
export const V9_AUTOMATION_ID = 'wp-015d3b-v9d-v1' as const;

/** Frozen R6 replay provenance retained only for historical verification. */
export const V10_R6_AUTOMATION_ID = 'wp-023-v10-r6-live-v1' as const;
/** Current R7 terrain-as-gameplay authority. */
export const V10_R7_AUTOMATION_ID = 'wp-024-v10-r7-live-v1' as const;
/** R8 server-backed objective-mode Practice canary authority. */
export const V10_R8_AUTOMATION_ID = 'wp-026-v10-r8-objectives-v1' as const;
export const V10_AUTOMATION_ID = V10_R7_AUTOMATION_ID;
export const V10_AUTOMATION_IDS = Object.freeze([
    V10_R6_AUTOMATION_ID,
    V10_R7_AUTOMATION_ID,
    V10_R8_AUTOMATION_ID
] as const);
export type V10AutomationId = typeof V10_AUTOMATION_IDS[number];
export function isV10AutomationId(value: unknown): value is V10AutomationId {
    return value === V10_R6_AUTOMATION_ID || value === V10_R7_AUTOMATION_ID ||
        value === V10_R8_AUTOMATION_ID;
}
