import { canonicalJson, compareCanonicalText, sha256Digest } from '../canonical';
import {
    ProjectionTransportAssessmentV2Schema,
    ScenarioDomainSchema
} from '../schemas';
import type {
    AliasingWitness,
    ProjectionTransportAssessmentV2,
    ScenarioDomain
} from '../types';

export const FINITE_SAMPLE_TRANSPORT_LIMIT =
    'Passing this finite sampled domain is bounded evidence only; it does not prove deterministic transport over an undeclared world.';

export type QuotientTransportOptions<TSource> = Readonly<{
    assessmentId: string;
    assessmentVersion?: number;
    sampledDomain: ScenarioDomain;
    itemReference?: (item: TSource, index: number) => string;
    blockedClaims?: readonly string[];
}>;

type Observation = Readonly<{
    itemRef: string;
    sourceClassKey: string;
    targetClassKey: string;
}>;

function detachedClone<T>(value: T): T {
    return JSON.parse(canonicalJson(value)) as T;
}

function classKey(prefix: 'source' | 'target', key: unknown): string {
    return `${prefix}-${sha256Digest(key)}`;
}

function witness(
    assessmentId: string,
    pairIndex: number,
    side: 'left' | 'right',
    observation: Observation
): AliasingWitness {
    const identity = {
        assessmentId,
        pairIndex,
        side,
        sourceClassKey: observation.sourceClassKey,
        targetClassKey: observation.targetClassKey,
        itemRef: observation.itemRef
    };
    return {
        witnessRef: {
            witnessId: `alias-${sha256Digest(identity).slice(0, 40)}-${side}`,
            digest: sha256Digest(identity)
        },
        sourceClassKey: observation.sourceClassKey,
        targetClassKey: observation.targetClassKey,
        sourceItemRef: observation.itemRef,
        targetItemRef: `${observation.itemRef}:advanced`
    };
}

/**
 * Assesses finite sampled transport from one declared quotient to another.
 * Items are cloned before projection and advance, and a passing sample always
 * retains an explicit bounded-evidence warning.
 */
export function assessQuotientTransport<TSource, TTarget>(
    items: readonly TSource[],
    sourceQuotientKey: (item: TSource, index: number) => unknown,
    advance: (item: TSource, index: number) => TTarget,
    targetQuotientKey: (item: TTarget, index: number) => unknown,
    options: QuotientTransportOptions<TSource>
): ProjectionTransportAssessmentV2 {
    if (items.length === 0) {
        throw new RangeError('Quotient-transport assessment requires at least one witnessed item.');
    }

    const sampledDomain = ScenarioDomainSchema.parse(options.sampledDomain);
    const observations: Observation[] = [];
    const itemRefs = new Set<string>();

    for (let index = 0; index < items.length; index += 1) {
        const sourceForReference = detachedClone(items[index]);
        const itemRef = options.itemReference
            ? options.itemReference(sourceForReference, index)
            : `item-${String(index).padStart(4, '0')}`;
        if (typeof itemRef !== 'string' || itemRef.trim() !== itemRef || itemRef.length === 0) {
            throw new TypeError('Quotient item references must be non-empty trimmed strings.');
        }
        if (itemRefs.has(itemRef)) {
            throw new RangeError(`Duplicate quotient item reference ${JSON.stringify(itemRef)}.`);
        }
        itemRefs.add(itemRef);

        const sourceKey = classKey('source', sourceQuotientKey(detachedClone(items[index]), index));
        const advanced = advance(detachedClone(items[index]), index);
        const targetKey = classKey('target', targetQuotientKey(detachedClone(advanced), index));
        observations.push({ itemRef, sourceClassKey: sourceKey, targetClassKey: targetKey });
    }

    const sourceMembers = new Map<string, string[]>();
    const targetMembers = new Map<string, string[]>();
    const transitions = new Map<string, Set<string>>();
    for (const observation of observations) {
        sourceMembers.set(observation.sourceClassKey, [
            ...(sourceMembers.get(observation.sourceClassKey) ?? []),
            observation.itemRef
        ]);
        targetMembers.set(observation.targetClassKey, [
            ...(targetMembers.get(observation.targetClassKey) ?? []),
            `${observation.itemRef}:advanced`
        ]);
        const targets = transitions.get(observation.sourceClassKey) ?? new Set<string>();
        targets.add(observation.targetClassKey);
        transitions.set(observation.sourceClassKey, targets);
    }

    const sourceClasses = [...sourceMembers.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([classKeyValue, refs]) => ({
            classKey: classKeyValue,
            memberRefs: [...refs].sort(compareCanonicalText)
        }));
    const targetClasses = [...targetMembers.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([classKeyValue, refs]) => ({
            classKey: classKeyValue,
            memberRefs: [...refs].sort(compareCanonicalText)
        }));
    const observedTransitions = [...transitions.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([sourceClassKey, targets]) => ({
            sourceClassKey,
            targetClassKeys: [...targets].sort(compareCanonicalText)
        }));
    const aliasingKeys = observedTransitions
        .filter((transition) => transition.targetClassKeys.length > 1)
        .map((transition) => transition.sourceClassKey);
    const aliasingWitnessPairs = aliasingKeys.map((sourceClassKey, pairIndex) => {
        const targetKeys = transitions.get(sourceClassKey);
        if (!targetKeys) throw new Error('Internal quotient transition index is incomplete.');
        const [leftTarget, rightTarget] = [...targetKeys].sort(compareCanonicalText);
        const candidates = observations
            .filter((item) => item.sourceClassKey === sourceClassKey)
            .sort((left, right) => compareCanonicalText(left.itemRef, right.itemRef));
        const left = candidates.find((item) => item.targetClassKey === leftTarget);
        const right = candidates.find((item) => item.targetClassKey === rightTarget);
        if (!left || !right) throw new Error('Internal quotient alias witness index is incomplete.');
        return {
            left: witness(options.assessmentId, pairIndex, 'left', left),
            right: witness(options.assessmentId, pairIndex, 'right', right)
        };
    });
    const deterministicMapEligibility = aliasingKeys.length === 0;
    const blockedClaims = [
        FINITE_SAMPLE_TRANSPORT_LIMIT,
        ...[...(options.blockedClaims ?? [])].sort(compareCanonicalText)
    ].filter((value, index, values) => values.indexOf(value) === index);

    return ProjectionTransportAssessmentV2Schema.parse({
        schemaVersion: 2,
        assessmentId: options.assessmentId,
        assessmentVersion: options.assessmentVersion ?? 1,
        sourceClasses,
        targetClasses,
        observedTransitions,
        deterministicMapEligibility,
        aliasingKeys,
        aliasingWitnessPairs,
        recommendedShape: deterministicMapEligibility ? 'map' : 'relation_or_kernel',
        sampledDomain,
        blockedClaims
    });
}
