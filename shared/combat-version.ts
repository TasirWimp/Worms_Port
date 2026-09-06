import { V7_RULESET_ID, type SimulationRulesetId } from './simulation';
import type { V8RulesetId } from './simulation-v8';
import { V9_RULESET_ID } from './simulation-v9';

/** One selector for both modes. V8B/C do not activate the candidate. */
export const CURRENT_COMBAT_RULESET_ID = V7_RULESET_ID;
export type CombatRulesetId = SimulationRulesetId | V8RulesetId | typeof V9_RULESET_ID;
// Reserved A6 identity only. No V8 automated policy is implemented in B.
export const V8_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v3' as const;
export const V8_LOOMKEEPER_PROFILE_ID = 'standard-v8-0' as const;
/** Required provenance for D's automated r1 envelope; reserved labels alone are not proof. */
export const V8_AUTOMATION_ID = 'wp-015d3a-v8d-r1-v1' as const;
/** Strict V9D provenance; the numeric V9 replay version remains unchanged. */
export const V9_AUTOMATION_ID = 'wp-015d3b-v9d-v1' as const;
