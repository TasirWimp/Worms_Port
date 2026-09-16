import type { SimulationWinner } from './simulation';

/** Lightweight R8 ownership identity shared by routes that do not run simulation code. */
export const V10_R8_RULESET_ID = 'nimble-knots-artillery-v10-r8' as const;
export const V10_R8_OBJECTIVE_RECIPE_REVISION = 'volcanic-ruin-objectives-r1' as const;
export const V10_R8_OBJECTIVE_MODES = Object.freeze(['defend', 'collect', 'claim'] as const);

export type V10R8ObjectiveMode = typeof V10_R8_OBJECTIVE_MODES[number];
export type V10R8ObjectiveKind = 'coin' | 'chest';
export type V10R8ObjectiveStatus = 'active' | 'collected' | 'captured' | 'lost';
export type V10R8ObjectiveResultReason = 'elimination' | 'chest_captured' | 'chest_lost' |
    'coin_lead' | 'coins_resolved' | 'turn_limit' | 'simulation_limit' | 'simultaneous';
export type V10R8ObjectiveResult = Readonly<{
    winner: SimulationWinner;
    reason: V10R8ObjectiveResultReason;
}>;
