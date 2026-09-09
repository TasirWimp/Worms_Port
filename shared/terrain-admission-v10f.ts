import { V5_LAUNCH_SPEED_RULES, SIM_RULES, terrainSolid, type PackedTerrain } from './simulation';
import {
    V10_AUTHORING_EXPANSION, V10_PROCEDURAL_CANDIDATE_COUNT,
    V10_PROCEDURAL_FALLBACK_CANDIDATE_INDEX,
    generateV10ProceduralSurfaceCandidates, packV10SurfaceRows,
    type V10ProceduralJumpLandmark, type V10ProceduralSurfaceCandidate
} from './terrain-generation-v10';

const WORLD_UNITS_PER_AUTHORING_COLUMN = V10_AUTHORING_EXPANSION * SIM_RULES.terrainCellSize;
const MOVEMENT_STEPS = SIM_RULES.movementPerTurn / SIM_RULES.movementStep;
const MAXIMUM_WALK_STEP = 16;
const SHALLOW_ANGLE = 5_000;
const SHALLOW_POWER = 1_000;
const PREFLIGHT_AIMS = Object.freeze([
    [25_000, 650], [25_000, 850], [25_000, 1_000],
    [35_000, 650], [35_000, 850], [35_000, 1_000],
    [45_000, 650], [45_000, 850], [45_000, 1_000],
    [55_000, 650], [55_000, 850], [55_000, 1_000],
    [65_000, 650], [65_000, 850], [65_000, 1_000]
] as const);

export type V10FOpening = Readonly<{
    leftX: number;
    rightX: number;
    leftSurfaceY: number;
    rightSurfaceY: number;
}>;

export type V10FCandidateScore = Readonly<{
    familyLandmarkFit: number;
    worstSideLegalPreflightOptions: number;
    worstSideLocalMobility: number;
    centerBias: number;
    tieBreak: number;
    candidateIndex: number;
}>;

export type V10FJumpPosition = Readonly<{
    takeoffX: number;
    landingX: number;
    takeoffSurfaceY: number;
    landingSurfaceY: number;
    direction: -1 | 1;
    rise: number;
}>;

export type V10FCandidateEvaluation = Readonly<{
    candidate: V10ProceduralSurfaceCandidate;
    terrain: PackedTerrain;
    opening: V10FOpening;
    admitted: boolean;
    failures: readonly string[];
    shallowCover: readonly [boolean, boolean];
    legalPreflightOptions: readonly [number, number];
    localMobility: readonly [number, number];
    jumpPositions: readonly V10FJumpPosition[];
    score: V10FCandidateScore;
}>;

export type V10FSelection = Readonly<{
    selected: V10FCandidateEvaluation;
    evaluations: readonly V10FCandidateEvaluation[];
    admittedCandidates: number;
    fallbackUsed: boolean;
}>;

/** Runs fixed geometry, movement and ballistic probes for exactly eight candidates. */
export function selectV10ProceduralSurface(seed: number): V10FSelection {
    const candidates = generateV10ProceduralSurfaceCandidates(seed);
    if (candidates.length !== V10_PROCEDURAL_CANDIDATE_COUNT) {
        throw new Error(`V10F selection requires exactly ${V10_PROCEDURAL_CANDIDATE_COUNT} candidates.`);
    }
    const evaluations = Object.freeze(candidates.map(evaluateV10ProceduralCandidate));
    return selectV10ProceduralEvaluation(evaluations);
}

/** Pure ranking seam also makes the no-admission fallback directly testable. */
export function selectV10ProceduralEvaluation(
    evaluations: readonly V10FCandidateEvaluation[]
): V10FSelection {
    if (evaluations.length !== V10_PROCEDURAL_CANDIDATE_COUNT ||
        evaluations.some((item, index) => item.candidate.candidateIndex !== index)) {
        throw new Error('V10F ranking requires ordered candidate indices zero through seven.');
    }
    const admitted = evaluations.filter(item => item.admitted).sort(compareEvaluations);
    const fallbackUsed = admitted.length === 0;
    const selected = fallbackUsed
        ? evaluations[V10_PROCEDURAL_FALLBACK_CANDIDATE_INDEX]
        : admitted[0];
    return Object.freeze({
        selected,
        evaluations: Object.freeze([...evaluations]),
        admittedCandidates: admitted.length,
        fallbackUsed
    });
}

export function evaluateV10ProceduralCandidate(
    candidate: V10ProceduralSurfaceCandidate
): V10FCandidateEvaluation {
    const terrain = packV10SurfaceRows(candidate.rows);
    const [leftColumn, rightColumn] = candidate.openingColumns;
    const leftCentre = authoringColumnWorldX(leftColumn);
    const rightCentre = authoringColumnWorldX(rightColumn);
    const leftX = resolveOpeningX(terrain, leftCentre, -1) ?? leftCentre;
    const rightX = resolveOpeningX(terrain, rightCentre, 1) ?? rightCentre;
    const leftSurfaceY = bodyClearSurfaceY(terrain, leftX);
    const rightSurfaceY = bodyClearSurfaceY(terrain, rightX);
    const opening: V10FOpening = Object.freeze({
        leftX,
        rightX,
        leftSurfaceY: leftSurfaceY ?? surfaceY(terrain, leftX),
        rightSurfaceY: rightSurfaceY ?? surfaceY(terrain, rightX)
    });
    const failures: string[] = [];
    if (leftSurfaceY === null) failures.push('left_start_body_clear');
    if (rightSurfaceY === null) failures.push('right_start_body_clear');
    if (leftX < SIM_RULES.actorRadius + SIM_RULES.movementPerTurn) failures.push('left_start_margin');
    if (rightX > terrain.width * terrain.cellSize - SIM_RULES.actorRadius - SIM_RULES.movementPerTurn) {
        failures.push('right_start_margin');
    }

    const leftOutward = movementReach(terrain, leftX, -1);
    const rightOutward = movementReach(terrain, rightX, 1);
    if (leftOutward < MOVEMENT_STEPS) failures.push('left_outward_movement');
    if (rightOutward < MOVEMENT_STEPS) failures.push('right_outward_movement');

    const jumpPositions = Object.freeze(candidate.jumpLandmarks.flatMap((landmark, index) => {
        const position = resolveJumpLandmark(terrain, landmark);
        if (!position) failures.push(`jump_${index}_geometry`);
        return position ? [position] : [];
    }));

    const shallowCover = Object.freeze([
        hasShallowCover(terrain, leftX, opening.leftSurfaceY, rightX, opening.rightSurfaceY),
        hasShallowCover(terrain, rightX, opening.rightSurfaceY, leftX, opening.leftSurfaceY)
    ]) as readonly [boolean, boolean];
    if (!shallowCover[0]) failures.push('left_shallow_cover');
    if (!shallowCover[1]) failures.push('right_shallow_cover');

    const legalPreflightOptions = Object.freeze([
        countLegalOptions(terrain, jumpPositions, 0, opening),
        countLegalOptions(terrain, jumpPositions, 1, opening)
    ]) as readonly [number, number];
    if (legalPreflightOptions[0] === 0) failures.push('left_legal_attack');
    if (legalPreflightOptions[1] === 0) failures.push('right_legal_attack');

    const localMobility = Object.freeze([
        movementReach(terrain, leftX, -1) + movementReach(terrain, leftX, 1),
        movementReach(terrain, rightX, -1) + movementReach(terrain, rightX, 1)
    ]) as readonly [number, number];
    const score = Object.freeze({
        familyLandmarkFit: familyLandmarkFit(candidate, terrain),
        worstSideLegalPreflightOptions: Math.min(...legalPreflightOptions),
        worstSideLocalMobility: Math.min(...localMobility),
        centerBias: Math.abs((leftX + rightX) - terrain.width * terrain.cellSize),
        tieBreak: rankingTieBreak(candidate.seed, candidate.profileId, candidate.candidateIndex),
        candidateIndex: candidate.candidateIndex
    });
    return Object.freeze({
        candidate,
        terrain,
        opening,
        admitted: failures.length === 0,
        failures: Object.freeze(failures),
        shallowCover,
        legalPreflightOptions,
        localMobility,
        jumpPositions,
        score
    });
}

function countLegalOptions(
    terrain: PackedTerrain,
    jumpPositions: readonly V10FJumpPosition[],
    side: 0 | 1,
    opening: V10FOpening
): number {
    const targetX = side === 0 ? opening.rightX : opening.leftX;
    const targetSurfaceY = side === 0 ? opening.rightSurfaceY : opening.leftSurfaceY;
    const startX = side === 0 ? opening.leftX : opening.rightX;
    const origins = [startX, ...jumpPositions
        .filter(item => side === 0 ? item.landingX < 1024 : item.landingX >= 1024)
        .map(item => item.landingX)];
    let legal = 0;
    for (const originX of new Set(origins)) {
        const originSurfaceY = bodyClearSurfaceY(terrain, originX);
        if (originSurfaceY === null) continue;
        for (const [angle, power] of PREFLIGHT_AIMS) {
            const outcome = projectilePreflight(
                terrain, originX, originSurfaceY, targetX, targetSurfaceY, angle, power
            );
            const progress = Math.abs(outcome.x - originX);
            const requiredProgress = Math.max(128, Math.trunc(Math.abs(targetX - originX) / 4));
            if (outcome.target === 'opponent' || (outcome.target === 'terrain' &&
                (Math.abs(outcome.x - targetX) <= 64 || progress >= requiredProgress))) legal += 1;
        }
    }
    return legal;
}

function hasShallowCover(
    terrain: PackedTerrain,
    startX: number,
    startSurfaceY: number,
    targetX: number,
    targetSurfaceY: number
): boolean {
    const outcome = projectilePreflight(
        terrain, startX, startSurfaceY, targetX, targetSurfaceY, SHALLOW_ANGLE, SHALLOW_POWER
    );
    return outcome.target === 'terrain' &&
        Math.abs(outcome.x - startX) >= 64 &&
        Math.abs(outcome.x - targetX) >= 64;
}

function projectilePreflight(
    terrain: PackedTerrain,
    startX: number,
    startSurfaceY: number,
    targetX: number,
    targetSurfaceY: number,
    angleMilliDegrees: number,
    powerPermille: number
): { target: 'opponent' | 'terrain' | 'world_exit' | 'lifetime'; x: number; y: number } {
    const direction = targetX > startX ? 1 : -1;
    const band = V5_LAUNCH_SPEED_RULES.threadball;
    const speed = band.minimumShotSpeed + Math.trunc(
        (band.maximumShotSpeed - band.minimumShotSpeed) * powerPermille / 1000
    );
    let xFp = (startX + direction * 16) * 256;
    let yFp = (startSurfaceY - SIM_RULES.actorRadius - 4) * 256;
    const vxFp = Math.trunc(speed * (90_000 - Math.abs(angleMilliDegrees)) / 90_000) * direction;
    let vyFp = -Math.trunc(speed * angleMilliDegrees / 90_000);
    for (let tick = 1; tick <= 300; tick += 1) {
        const oldX = xFp;
        const oldY = yFp;
        vyFp += 80;
        xFp += vxFp;
        yFp += vyFp;
        const x0 = Math.trunc(oldX / 256);
        const y0 = Math.trunc(oldY / 256);
        const x1 = Math.trunc(xFp / 256);
        const y1 = Math.trunc(yFp / 256);
        const steps = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let step = 1; step <= steps; step += 1) {
            const x = x0 + Math.trunc((x1 - x0) * step / steps);
            const y = y0 + Math.trunc((y1 - y0) * step / steps);
            const targetRootY = targetSurfaceY - SIM_RULES.actorRadius;
            if (Math.abs(targetX - x) <= 32 && y >= targetRootY - 85 && y <= targetRootY + 13) {
                return { target: 'opponent', x, y };
            }
            if (terrainSolid(terrain, Math.trunc(x / terrain.cellSize), Math.trunc(y / terrain.cellSize))) {
                return { target: 'terrain', x, y };
            }
        }
        const x = Math.trunc(xFp / 256);
        const y = Math.trunc(yFp / 256);
        if (x < 0 || x >= terrain.width * terrain.cellSize || y < 0 || y >= terrain.height * terrain.cellSize) {
            return { target: 'world_exit', x, y };
        }
    }
    return { target: 'lifetime', x: Math.trunc(xFp / 256), y: Math.trunc(yFp / 256) };
}

function resolveJumpLandmark(
    terrain: PackedTerrain,
    landmark: V10ProceduralJumpLandmark
): V10FJumpPosition | null {
    const intendedTakeoff = authoringColumnWorldX(landmark.takeoffColumn);
    const intendedLanding = authoringColumnWorldX(landmark.landingColumn);
    const direction = intendedLanding > intendedTakeoff ? 1 : -1;
    for (const offset of SEARCH_OFFSETS) {
        const takeoffX = intendedTakeoff + offset;
        const landingX = takeoffX + direction * 64;
        if (Math.abs(landingX - intendedLanding) > 32) continue;
        const takeoffSurfaceY = bodyClearSurfaceY(terrain, takeoffX);
        const landingSurfaceY = bodyClearSurfaceY(terrain, landingX);
        if (takeoffSurfaceY === null || landingSurfaceY === null) continue;
        const rise = takeoffSurfaceY - landingSurfaceY;
        if (rise < 24 || rise > 48 || routeIsWalkable(terrain, takeoffX, landingX)) continue;
        return Object.freeze({ takeoffX, landingX, takeoffSurfaceY, landingSurfaceY, direction, rise });
    }
    return null;
}

const SEARCH_OFFSETS = Object.freeze([0, -8, 8, -16, 16, -24, 24, -32, 32]);

function resolveOpeningX(terrain: PackedTerrain, intendedX: number, outward: -1 | 1): number | null {
    for (const offset of SEARCH_OFFSETS) {
        const x = intendedX + offset;
        if (bodyClearSurfaceY(terrain, x) !== null && movementReach(terrain, x, outward) >= MOVEMENT_STEPS) {
            return x;
        }
    }
    return null;
}

function familyLandmarkFit(candidate: V10ProceduralSurfaceCandidate, terrain: PackedTerrain): number {
    const rows = candidate.rows;
    const relief = Math.max(...rows) - Math.min(...rows);
    const midpoint = Math.trunc(rows.length / 2);
    const centreRelief = candidate.baseRow - Math.min(...rows.slice(midpoint - 24, midpoint + 24));
    const openingDifference = Math.abs(
        surfaceY(terrain, authoringColumnWorldX(candidate.openingColumns[0])) -
        surfaceY(terrain, authoringColumnWorldX(candidate.openingColumns[1]))
    ) / terrain.cellSize;
    if (candidate.profileId === 'twin-crests') return centreRelief * 16 + relief;
    if (candidate.profileId === 'asymmetric-rampart') return openingDifference * 16 + relief;
    if (candidate.profileId === 'trench-needle') {
        const barriers = candidate.operations.filter(item => item.kind === 'ridge' || item.kind === 'notch').length;
        return barriers * 16 + relief;
    }
    return candidate.jumpLandmarks.length * 32 + centreRelief * 8 + relief;
}

function movementReach(terrain: PackedTerrain, startX: number, direction: -1 | 1): number {
    let x = startX;
    let surface = surfaceY(terrain, x);
    let steps = 0;
    while (steps < MOVEMENT_STEPS) {
        const targetX = x + direction * SIM_RULES.movementStep;
        if (targetX < SIM_RULES.actorRadius ||
            targetX > terrain.width * terrain.cellSize - SIM_RULES.actorRadius - 1) break;
        const targetSurface = surfaceY(terrain, targetX);
        if (Math.abs(targetSurface - surface) > SIM_RULES.movementStep) break;
        x = targetX;
        surface = targetSurface;
        steps += 1;
    }
    return steps;
}

function routeIsWalkable(terrain: PackedTerrain, firstX: number, secondX: number): boolean {
    const direction = firstX < secondX ? 1 : -1;
    let previous = surfaceY(terrain, firstX);
    for (let x = firstX + direction * terrain.cellSize; x !== secondX + direction * terrain.cellSize; x += direction * terrain.cellSize) {
        const next = surfaceY(terrain, x);
        if (Math.abs(next - previous) > MAXIMUM_WALK_STEP) return false;
        previous = next;
    }
    return true;
}

function bodyClearSurfaceY(terrain: PackedTerrain, x: number): number | null {
    const supportY = surfaceY(terrain, x);
    const leftColumn = Math.floor((x - SIM_RULES.actorRadius) / terrain.cellSize);
    const rightColumn = Math.ceil((x + SIM_RULES.actorRadius) / terrain.cellSize) - 1;
    const topRow = Math.max(0, Math.floor((supportY - SIM_RULES.actorRadius * 2) / terrain.cellSize));
    const bottomRow = Math.floor((supportY - 1) / terrain.cellSize);
    for (let column = leftColumn; column <= rightColumn; column += 1) {
        for (let row = topRow; row <= bottomRow; row += 1) {
            if (terrainSolid(terrain, column, row)) return null;
        }
    }
    return supportY;
}

function surfaceY(terrain: PackedTerrain, worldX: number): number {
    const column = Math.max(0, Math.min(terrain.width - 1, Math.floor(worldX / terrain.cellSize)));
    for (let row = 0; row < terrain.height; row += 1) {
        if (terrainSolid(terrain, column, row)) return row * terrain.cellSize;
    }
    return terrain.height * terrain.cellSize;
}

function authoringColumnWorldX(column: number): number {
    return column * WORLD_UNITS_PER_AUTHORING_COLUMN + Math.trunc(WORLD_UNITS_PER_AUTHORING_COLUMN / 2);
}

function compareEvaluations(first: V10FCandidateEvaluation, second: V10FCandidateEvaluation): number {
    return second.score.familyLandmarkFit - first.score.familyLandmarkFit ||
        second.score.worstSideLegalPreflightOptions - first.score.worstSideLegalPreflightOptions ||
        second.score.worstSideLocalMobility - first.score.worstSideLocalMobility ||
        first.score.centerBias - second.score.centerBias ||
        first.score.tieBreak - second.score.tieBreak ||
        first.score.candidateIndex - second.score.candidateIndex;
}

function rankingTieBreak(seed: number, profileId: string, candidateIndex: number): number {
    let value = (seed ^ Math.imul(candidateIndex + 1, 0x9E3779B1)) >>> 0;
    for (let index = 0; index < profileId.length; index += 1) {
        value = Math.imul(value ^ profileId.charCodeAt(index), 0x01000193) >>> 0;
    }
    value = Math.imul(value ^ (value >>> 16), 0x85EBCA6B) >>> 0;
    return (value ^ (value >>> 13)) >>> 0;
}
