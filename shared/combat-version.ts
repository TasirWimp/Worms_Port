import { V7_RULESET_ID, type SimulationRulesetId } from './simulation';
import type { V8RulesetId } from './simulation-v8';

/** One selector for both modes. V8B/C do not activate the candidate. */
export const CURRENT_COMBAT_RULESET_ID = V7_RULESET_ID;
export type CombatRulesetId = SimulationRulesetId | V8RulesetId;
// Reserved A6 identity only. No V8 automated policy is implemented in B.
export const V8_LOOMKEEPER_POLICY_ID = 'nimble-knots-loomkeeper-v3' as const;
export const V8_LOOMKEEPER_PROFILE_ID = 'standard-v8-0' as const;
