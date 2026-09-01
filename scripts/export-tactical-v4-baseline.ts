import {
    DIRECT_PROJECTILE_HITBOXES,
    RELIC_RULES,
    SIM_RULES,
    V4_ARENA_RULES,
    V4_RULESET_ID,
    V4_RULESET_VERSION,
    applySimulationCommand,
    createSimulation
} from '../shared/simulation';

const BASELINE_SEED = 0xC0FFEE11;

export function buildAuthoritativeV4BaselineFixture() {
    let state = createSimulation(BASELINE_SEED, 'wizard', V4_RULESET_ID);
    const initial = {
        seed: state.seed,
        activeActor: state.activeActor,
        turn: state.turn,
        movementRemaining: state.movementRemaining,
        selectedRelic: state.selectedRelic,
        player: { x: state.units[0].x, stitching: state.units[0].stitching },
        loomkeeper: { x: state.units[1].x, stitching: state.units[1].stitching }
    };
    for (let index = 0; index < SIM_RULES.movementPerTurn / SIM_RULES.movementStep; index += 1) {
        const transition = applySimulationCommand(
            state, 'player', { type: 'move', direction: 1 }, state.turn
        );
        if (!transition.accepted) throw new Error('V4 baseline movement transcript became invalid.');
        state = transition.state;
    }
    const levelGroundMaximumRange = Math.trunc(
        SIM_RULES.maximumShotSpeed * SIM_RULES.maximumShotSpeed /
        (2 * SIM_RULES.gravityPerTick * SIM_RULES.fixedPointScale)
    );

    return {
        schemaVersion: 1,
        fixtureId: 'v4-authoritative-baseline-v1',
        source: 'shared/simulation.ts',
        ruleset: {
            id: V4_RULESET_ID,
            version: V4_RULESET_VERSION,
            formatVersion: 4
        },
        arena: {
            worldWidth: V4_ARENA_RULES.worldWidth,
            worldHeight: V4_ARENA_RULES.worldHeight,
            terrainCellSize: V4_ARENA_RULES.terrainCellSize,
            terrainWidth: V4_ARENA_RULES.terrainWidth,
            terrainHeight: V4_ARENA_RULES.terrainHeight,
            playerSpawnX: V4_ARENA_RULES.playerSpawnX,
            loomkeeperSpawnX: V4_ARENA_RULES.loomkeeperSpawnX
        },
        stitching: { maximum: SIM_RULES.maximumStitching },
        turn: {
            maximumTurns: SIM_RULES.maximumTurns,
            movementPerTurn: SIM_RULES.movementPerTurn,
            movementStep: SIM_RULES.movementStep
        },
        ballistics: {
            fixedPointScale: SIM_RULES.fixedPointScale,
            gravityPerTick: SIM_RULES.gravityPerTick,
            minimumShotSpeed: SIM_RULES.minimumShotSpeed,
            maximumShotSpeed: SIM_RULES.maximumShotSpeed,
            levelGroundMaximumRange
        },
        directHitbox: DIRECT_PROJECTILE_HITBOXES[V4_RULESET_ID],
        relics: RELIC_RULES,
        initial,
        structuralMoveTranscript: {
            actor: 'player',
            command: { type: 'move', direction: 1 },
            repetitions: SIM_RULES.movementPerTurn / SIM_RULES.movementStep,
            after: {
                activeActor: state.activeActor,
                turn: state.turn,
                movementRemaining: state.movementRemaining,
                player: { x: state.units[0].x, stitching: state.units[0].stitching },
                loomkeeper: { x: state.units[1].x, stitching: state.units[1].stitching }
            }
        }
    };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    process.stdout.write(`${JSON.stringify(buildAuthoritativeV4BaselineFixture(), null, 2)}\n`);
}
