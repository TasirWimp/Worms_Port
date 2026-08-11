import { canonicalJson, compareCanonicalText } from '../canonical';
import { WorldCutDefinitionSchema } from '../schemas';
import type { WorldCutDefinition } from '../types';
import { V4_CUT_DEFINITIONS, type V4CutId } from './v4-cuts';

const encodedCuts = new Map<string, string>();

for (const definition of V4_CUT_DEFINITIONS) {
    const key = `${definition.cutId}@${definition.cutVersion}`;
    if (encodedCuts.has(key)) {
        throw new Error(`Duplicate CRPM-world cut registration ${key}.`);
    }
    encodedCuts.set(key, canonicalJson(definition));
}

function decodeCut(encoded: string): WorldCutDefinition {
    return WorldCutDefinitionSchema.parse(JSON.parse(encoded));
}

export function getCutDefinition(cutId: V4CutId, cutVersion = 1): WorldCutDefinition {
    const key = `${cutId}@${cutVersion}`;
    const encoded = encodedCuts.get(key);
    if (!encoded) {
        throw new RangeError(`Unknown or unversioned CRPM-world cut ${key}.`);
    }
    return decodeCut(encoded);
}

export function listCutDefinitions(): WorldCutDefinition[] {
    return [...encodedCuts.entries()]
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([, encoded]) => decodeCut(encoded));
}

export function hasCutDefinition(cutId: string, cutVersion: number): boolean {
    return encodedCuts.has(`${cutId}@${cutVersion}`);
}
