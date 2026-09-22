import type { ReplayRecordV10 } from '../../../shared/protocol-v10';
import type { SimulationStateV10R8, V10R8ObjectiveMode } from '../../../shared/simulation-v10-r8';

export const V10_R8_CHAPTER_OBSERVATION_REVISION = 'v10-r8-chapter-observation-r1' as const;

type Direction = 'left' | 'right';
type Relic = SimulationStateV10R8['selectedRelic'];

export type ChapterObservationV10R8 = Readonly<{
    revision: typeof V10_R8_CHAPTER_OBSERVATION_REVISION;
    mode: V10R8ObjectiveMode;
    playerRole: 'collector' | 'chest_defender' | 'chest_attacker';
    loomkeeperRole: 'collector' | 'chest_defender' | 'chest_attacker';
    loomkeeperTurn: number;
    opening: boolean;
    basis: Readonly<{ beforeStateHash: string; afterStateHash: string; firstPlayerRecord: number | null; lastPlayerRecord: number | null }>;
    priorLoomkeeper: Readonly<{
        turn: number;
        selectedCandidateId: string;
        observedStateHash: string;
        action: string | null;
        result: string | null;
    }> | null;
    playerAction: Readonly<{
        walkDirections: readonly Direction[];
        jumps: number;
        neutralJumps: number;
        threadleaps: number;
        threadguards: number;
        aimUpdates: number;
        shots: readonly Relic[];
    }>;
    observedChange: Readonly<{
        playerMovement: Readonly<{ x: number; y: number }>;
        loomkeeperMovement: Readonly<{ x: number; y: number }>;
        playerStitching: number;
        loomkeeperStitching: number;
        playerScore: number;
        loomkeeperScore: number;
        terrainRevision: number;
        objectives: readonly Readonly<{
            id: string;
            from: SimulationStateV10R8['objective']['objects'][number]['status'];
            to: SimulationStateV10R8['objective']['objects'][number]['status'];
            resolvedBy: 'player' | 'loomkeeper' | null;
        }>[];
    }>;
}>;

/** Derive only witnessed action and state facts; motives and future routes belong to a later interpretive port. */
export function compileChapterObservationV10R8(input: Readonly<{
    before: SimulationStateV10R8;
    after: SimulationStateV10R8;
    beforeStateHash: string;
    afterStateHash: string;
    replayRecords: readonly ReplayRecordV10[];
    priorLoomkeeper?: ChapterObservationV10R8['priorLoomkeeper'];
}>): ChapterObservationV10R8 {
    const { before, after } = input;
    const playerTurn = after.turn - 1;
    if (after.objective.objectiveMode !== before.objective.objectiveMode ||
        after.activeActor !== 'loomkeeper' || after.phase !== 'action' ||
        before.activeActor !== 'player' || before.turn !== playerTurn) {
        throw new Error('A chapter must span one player turn inside one R8 match frame.');
    }
    if (input.priorLoomkeeper &&
        (input.priorLoomkeeper.turn !== after.turn - 2 ||
            input.priorLoomkeeper.observedStateHash !== input.beforeStateHash)) {
        throw new Error('The preceding Loomkeeper outcome does not match the observed chapter.');
    }
    const playerRecords = input.replayRecords.filter(record => record.operation.kind === 'intent' &&
        record.operation.actor === 'player' && record.operation.expectedTurn === playerTurn);
    const directions = new Set<Direction>();
    let selectedRelic: Relic = before.selectedRelic;
    let jumps = 0;
    let neutralJumps = 0;
    let threadleaps = 0;
    let threadguards = 0;
    let aimUpdates = 0;
    const shots: Relic[] = [];
    for (const record of playerRecords) {
        const operation = record.operation;
        if (operation.kind !== 'intent') continue;
        const intent = operation.intent;
        if (intent.type === 'walk_start') directions.add(intent.direction < 0 ? 'left' : 'right');
        else if (intent.type === 'jump') {
            jumps += 1;
            if (intent.direction === 0) neutralJumps += 1;
        } else if (intent.type === 'threadleap') threadleaps += 1;
        else if (intent.type === 'threadguard') threadguards += 1;
        else if (intent.type === 'aim') aimUpdates += 1;
        else if (intent.type === 'select_relic') selectedRelic = intent.relicId;
        else if (intent.type === 'fire') shots.push(selectedRelic);
    }
    const mode = after.objective.objectiveMode;
    const objectiveChanges = after.objective.objects.flatMap(object => {
        const old = before.objective.objects.find(item => item.id === object.id);
        if (!old) throw new Error('A chapter cannot introduce an unbound objective.');
        return old.status === object.status ? [] : [{
            id: object.id,
            from: old.status,
            to: object.status,
            resolvedBy: object.resolvedBy
        }];
    });
    const result: ChapterObservationV10R8 = {
        revision: V10_R8_CHAPTER_OBSERVATION_REVISION,
        mode,
        playerRole: mode === 'collect' ? 'collector' : mode === 'defend' ? 'chest_defender' : 'chest_attacker',
        loomkeeperRole: mode === 'collect' ? 'collector' : mode === 'defend' ? 'chest_attacker' : 'chest_defender',
        loomkeeperTurn: after.turn,
        opening: after.turn === 1,
        basis: {
            beforeStateHash: input.beforeStateHash,
            afterStateHash: input.afterStateHash,
            firstPlayerRecord: playerRecords[0]?.index ?? null,
            lastPlayerRecord: playerRecords.at(-1)?.index ?? null
        },
        priorLoomkeeper: input.priorLoomkeeper ?? null,
        playerAction: {
            walkDirections: [...directions], jumps, neutralJumps, threadleaps, threadguards, aimUpdates, shots
        },
        observedChange: {
            playerMovement: {
                x: Math.round((after.units[0].xFp - before.units[0].xFp) / 256),
                y: Math.round((after.units[0].yFp - before.units[0].yFp) / 256)
            },
            loomkeeperMovement: {
                x: Math.round((after.units[1].xFp - before.units[1].xFp) / 256),
                y: Math.round((after.units[1].yFp - before.units[1].yFp) / 256)
            },
            playerStitching: after.units[0].stitching - before.units[0].stitching,
            loomkeeperStitching: after.units[1].stitching - before.units[1].stitching,
            playerScore: after.objective.scores.player - before.objective.scores.player,
            loomkeeperScore: after.objective.scores.loomkeeper - before.objective.scores.loomkeeper,
            terrainRevision: after.terrainRevision - before.terrainRevision,
            objectives: objectiveChanges
        }
    };
    return Object.freeze(result);
}
