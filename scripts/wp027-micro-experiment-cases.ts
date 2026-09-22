import type {
    StrategicCandidateSummaryV10R8,
    StrategicPathPointV10R8
} from '../server/src/simulation/loomkeeper-strategy-v10-r8';
import type {
    Wp027ProbeFixture,
    Wp027ProbeId
} from '../server/src/simulation/loomkeeper-strategy-probes-v10-r8';

export type ClaimStatus = 'supported' | 'refuted' | 'unknown';
export type MicroAction = 'A' | 'B' | 'abstain';
export type EvidenceId = 'event' | 'A' | 'B' | 'limit';
export type ClaimAnswer = Readonly<{
    status: ClaimStatus;
    evidenceId: EvidenceId;
    reason: string;
}>;
export type ChoiceAnswer = Readonly<{ action: MicroAction; reason: string }>;

type Option = Readonly<{
    label: 'A' | 'B';
    candidateId: string;
    committedTargetDistanceBefore: number;
    committedTargetDistanceAfter: number;
    objectiveScoreDelta: number;
    ownStitchingDelta: number;
    opponentStitchingDelta: number;
    terrainCellsRemoved: number;
    namedLedgeCellsRemoved: number | null;
    path: Readonly<{
        start: StrategicPathPointV10R8;
        end: StrategicPathPointV10R8;
        shotImpact: StrategicPathPointV10R8 | null;
    }>;
}>;

export type MicroCase = Readonly<{
    id: Wp027ProbeId;
    objectiveMode: string;
    committedTargetId: string | null;
    currentMilestoneId: string | null;
    evidence: Readonly<Record<EvidenceId, string>>;
    options: readonly [Option, Option];
    currentClaim: string;
    futureClaim: string;
    computedClaim: string;
    computedEvidenceId: 'A' | 'B';
    expectedCurrent: Readonly<{ status: ClaimStatus; evidenceId: EvidenceId }>;
    expectedFuture: Readonly<{ status: ClaimStatus; evidenceId: EvidenceId }>;
    policy: string;
    expectedAction: MicroAction;
    acceptedStrategy: 'continue' | 'repair' | 'preserve' | 'abstain';
}>;

function candidateWith(
    fixture: Wp027ProbeFixture,
    predicate: (candidate: StrategicCandidateSummaryV10R8) => boolean
): StrategicCandidateSummaryV10R8 {
    const matches = fixture.boundary.brief.legalCandidates.filter(predicate);
    if (matches.length !== 1) throw new Error(`${fixture.id}: expected one matching candidate, got ${matches.length}.`);
    return matches[0];
}

function distance(candidate: StrategicCandidateSummaryV10R8): number {
    const value = candidate.worldDelta.committedTargetAfter?.distanceFromLoomkeeper;
    if (value === undefined) throw new Error('Experiment candidate lacks committed-target distance.');
    return value;
}

function ledgeRemoved(fixture: Wp027ProbeFixture, candidateId: string): number {
    let removed = 0;
    for (let y = 26; y <= 27; y += 1) {
        for (let x = 120; x <= 134; x += 1) {
            if (!fixture.boundary.candidateTerrainSolid(candidateId, x, y)) removed += 1;
        }
    }
    return removed;
}

function option(
    fixture: Wp027ProbeFixture,
    label: 'A' | 'B',
    candidate: StrategicCandidateSummaryV10R8
): Option {
    const brief = fixture.boundary.brief;
    const loomkeeper = brief.battlefield.actors.find(actor => actor.id === 'loomkeeper');
    const target = [...brief.battlefield.actors, ...brief.battlefield.objects]
        .find(item => item.id === fixture.currentStrategy.targetId);
    const path = fixture.boundary.pathAtlas().paths.find(item => item.candidateId === candidate.candidateId);
    if (!loomkeeper || !target || !path || path.waypoints.length === 0) {
        throw new Error(`${fixture.id}: experiment option lacks an authoritative target or path.`);
    }
    return Object.freeze({
        label,
        candidateId: candidate.candidateId,
        committedTargetDistanceBefore: Math.abs(target.x - loomkeeper.x) + Math.abs(target.y - loomkeeper.y),
        committedTargetDistanceAfter: distance(candidate),
        objectiveScoreDelta: candidate.immediate.objectiveScoreDelta,
        ownStitchingDelta: candidate.immediate.ownStitchingDelta,
        opponentStitchingDelta: candidate.immediate.opponentStitchingDelta,
        terrainCellsRemoved: candidate.immediate.terrainCellsRemoved,
        namedLedgeCellsRemoved: fixture.id === 'preserve-future-option'
            ? ledgeRemoved(fixture, candidate.candidateId) : null,
        path: Object.freeze({
            start: path.waypoints[0],
            end: path.waypoints[path.waypoints.length - 1],
            shotImpact: path.shot?.impact ?? null
        })
    });
}

export function buildMicroCase(fixture: Wp027ProbeFixture): MicroCase {
    const pick = (predicate: (candidate: StrategicCandidateSummaryV10R8) => boolean) =>
        candidateWith(fixture, predicate);
    let a: StrategicCandidateSummaryV10R8;
    let b: StrategicCandidateSummaryV10R8;
    let currentClaim: string;
    let futureClaim: string;
    let expectedCurrent: MicroCase['expectedCurrent'];
    let policy: string;
    let expectedAction: MicroAction;
    let acceptedStrategy: MicroCase['acceptedStrategy'];

    switch (fixture.id) {
        case 'temporary-cost-preparation':
            a = pick(c => distance(c) === 461 && c.immediate.opponentStitchingDelta === -7);
            b = pick(c => distance(c) === 600 && c.immediate.terrainCellsRemoved === 2);
            currentClaim = 'B ends farther from committed coin-1 than the current position.';
            futureClaim = 'B preserves a reachable route to coin-1 on the next Loomkeeper turn.';
            expectedCurrent = { status: 'supported', evidenceId: 'B' };
            policy = 'A temporary distance loss is justified only if its promised later route benefit is established; otherwise abstain.';
            expectedAction = 'abstain';
            acceptedStrategy = 'abstain';
            break;
        case 'continue-through-setback':
            a = pick(c => distance(c) === 633 && c.immediate.objectiveScoreDelta === 1 &&
                c.immediate.terrainCellsRemoved === 2);
            b = pick(c => distance(c) === 461 && c.immediate.opponentStitchingDelta === -7);
            currentClaim = 'The authoritative recent-change record says the committed lower route remains feasible now.';
            futureClaim = 'B guarantees that the lower route remains feasible after the player takes another turn.';
            expectedCurrent = { status: 'supported', evidenceId: 'event' };
            policy = 'Continue the currently feasible commitment; prefer the option that approaches coin-1 and damages the opponent without own stitching loss. Do not require a guarantee about the next player turn.';
            expectedAction = 'B';
            acceptedStrategy = 'continue';
            break;
        case 'repair-destroyed-route':
            a = pick(c => distance(c) === 13 && c.immediate.terrainCellsRemoved === 2);
            b = pick(c => distance(c) === 13 && c.immediate.terrainCellsRemoved === 61);
            currentClaim = 'The player destroyed the committed route support before this turn.';
            futureClaim = 'A guarantees a reachable replacement route on the next Loomkeeper turn.';
            expectedCurrent = { status: 'supported', evidenceId: 'event' };
            policy = 'The old route is invalid. As a provisional repair attempt, prefer the same-distance option that removes less terrain. Do not claim a future route is proven.';
            expectedAction = 'A';
            acceptedStrategy = 'repair';
            break;
        case 'preserve-future-option':
            a = pick(c => distance(c) === 1180 && ledgeRemoved(fixture, c.candidateId) === 14);
            b = pick(c => distance(c) === 1041 && c.immediate.terrainCellsRemoved === 2 &&
                ledgeRemoved(fixture, c.candidateId) === 0);
            currentClaim = 'B leaves all 30 cells of the named upper ledge intact after this turn.';
            futureClaim = 'B guarantees that the chest is reachable on the next Loomkeeper turn.';
            expectedCurrent = { status: 'supported', evidenceId: 'B' };
            policy = 'Preserve the exact witnessed ledge cells; prefer the option that keeps them and approaches the chest. This is not proof of future reachability.';
            expectedAction = 'B';
            acceptedStrategy = 'preserve';
            break;
        case 'acknowledge-information-gap':
            a = pick(c => distance(c) === 633 && c.immediate.objectiveScoreDelta === 1 &&
                c.immediate.terrainCellsRemoved === 2);
            b = pick(c => distance(c) === 461 && c.immediate.objectiveScoreDelta === 0 &&
                c.immediate.terrainCellsRemoved === 2);
            currentClaim = 'The available projection identifies which of the two hidden supports survives.';
            futureClaim = 'A guarantees that the necessary hidden support survives the next turn.';
            expectedCurrent = { status: 'refuted', evidenceId: 'event' };
            policy = 'The necessary support is unidentified; abstain rather than asserting that A or B preserves it.';
            expectedAction = 'abstain';
            acceptedStrategy = 'abstain';
            break;
    }

    const options = [option(fixture, 'A', a), option(fixture, 'B', b)] as const;
    const changes = fixture.recentChanges;
    const evidence = Object.freeze({
        event: JSON.stringify({
            previousAction: changes.previousAction,
            observedResult: changes.observedResult,
            playerChanges: changes.playerChanges,
            systemChanges: changes.systemChanges,
            unresolvedConcerns: changes.unresolvedConcerns
        }),
        A: JSON.stringify(options[0]),
        B: JSON.stringify(options[1]),
        limit: 'Each option is simulated through this Loomkeeper turn only. The next player response and future route reachability are not computed.'
    });
    const computed = (() => {
        switch (fixture.id) {
            case 'temporary-cost-preparation':
                return { claim: 'B ends this Loomkeeper turn 100 map units farther from committed coin-1 than it started.', evidenceId: 'B' } as const;
            case 'continue-through-setback':
                return { claim: 'B ends this Loomkeeper turn at distance 461 from committed coin-1.', evidenceId: 'B' } as const;
            case 'repair-destroyed-route':
                return { claim: 'A removes exactly 2 terrain cells during this Loomkeeper turn.', evidenceId: 'A' } as const;
            case 'preserve-future-option':
                return { claim: 'B removes zero cells from the named upper ledge during this Loomkeeper turn.', evidenceId: 'B' } as const;
            case 'acknowledge-information-gap':
                return { claim: 'A gains one objective point during this Loomkeeper turn.', evidenceId: 'A' } as const;
        }
    })();
    return Object.freeze({
        id: fixture.id,
        objectiveMode: fixture.boundary.brief.objective.mode,
        committedTargetId: fixture.currentStrategy.targetId,
        currentMilestoneId: fixture.currentStrategy.milestoneId,
        evidence,
        options,
        currentClaim,
        futureClaim,
        computedClaim: computed.claim,
        computedEvidenceId: computed.evidenceId,
        expectedCurrent,
        expectedFuture: { status: 'unknown', evidenceId: 'limit' } as const,
        policy,
        expectedAction,
        acceptedStrategy
    });
}

export function assembleMicroDecision(
    testCase: MicroCase,
    present: ClaimAnswer | null,
    future: ClaimAnswer | null,
    choice: ChoiceAnswer | null
): Readonly<{ action: MicroAction; strategy: MicroCase['acceptedStrategy']; source: string }> {
    if (!present || present.status !== testCase.expectedCurrent.status ||
        present.evidenceId !== testCase.expectedCurrent.evidenceId ||
        !future || future.status !== testCase.expectedFuture.status ||
        future.evidenceId !== testCase.expectedFuture.evidenceId) {
        return { action: 'abstain', strategy: 'abstain', source: 'claim_guard' };
    }
    if (testCase.expectedAction === 'abstain') {
        return { action: 'abstain', strategy: 'abstain', source: 'missing_fact_guard' };
    }
    if (!choice || choice.action !== testCase.expectedAction) {
        return { action: 'abstain', strategy: 'abstain', source: 'choice_guard' };
    }
    return { action: choice.action, strategy: testCase.acceptedStrategy, source: 'validated_preference' };
}

// Versioned diagnostic correction. R1 remains unchanged so its captured scores
// can always be reproduced. Citation choice is audit data; source facts, not
// model-selected citation strings, certify whether a claim is true or unknown.
export function assembleMicroDecisionV2(
    testCase: MicroCase,
    present: ClaimAnswer | null,
    future: ClaimAnswer | null,
    choice: ChoiceAnswer | null
): Readonly<{ action: MicroAction; strategy: MicroCase['acceptedStrategy']; source: string }> {
    if (!present || present.status !== testCase.expectedCurrent.status ||
        !future || future.status !== testCase.expectedFuture.status ||
        !Object.hasOwn(testCase.evidence, present.evidenceId) ||
        !Object.hasOwn(testCase.evidence, future.evidenceId)) {
        return { action: 'abstain', strategy: 'abstain', source: 'claim_guard' };
    }
    if (testCase.expectedAction === 'abstain') {
        return { action: 'abstain', strategy: 'abstain', source: 'missing_fact_guard' };
    }
    if (!choice || choice.action !== testCase.expectedAction) {
        return { action: 'abstain', strategy: 'abstain', source: 'choice_guard' };
    }
    return { action: choice.action, strategy: testCase.acceptedStrategy, source: 'validated_preference' };
}
