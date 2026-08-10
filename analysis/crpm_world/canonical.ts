import { createHash } from 'node:crypto';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const UNSTABLE_TIMESTAMP_KEY = /^(?:.*timestamp|.*timeMs|time|wallClockTime|createdAt|updatedAt|generatedAt|recordedAt|currentTime|now|when)$/i;
const ISO_WALL_CLOCK_VALUE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertDeterministicNumber(value: number, path: string): void {
    if (!Number.isFinite(value)) {
        throw new TypeError(`${path} must not contain NaN or Infinity.`);
    }
    if (Object.is(value, -0)) {
        throw new TypeError(`${path} must not contain negative zero.`);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new TypeError(`${path} must not contain an unsafe integer.`);
    }
}

function assertDeterministicKey(key: string, path: string): void {
    if (UNSTABLE_TIMESTAMP_KEY.test(key)) {
        throw new TypeError(`${path}.${key} is an unstable wall-clock timestamp field.`);
    }
    if (UNSAFE_OBJECT_KEYS.has(key)) {
        throw new TypeError(`${path}.${key} is not an admissible deterministic object key.`);
    }
}

function cloneDeterministicJson(
    value: unknown,
    path: string,
    ancestors: WeakSet<object>
): JsonValue {
    if (value === null || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        if (ISO_WALL_CLOCK_VALUE.test(value)) {
            throw new TypeError(`${path} must not contain an ISO wall-clock timestamp value.`);
        }
        return value;
    }
    if (typeof value === 'number') {
        assertDeterministicNumber(value, path);
        return value;
    }
    if (typeof value !== 'object') {
        throw new TypeError(`${path} contains a non-JSON value of type ${typeof value}.`);
    }
    if (ancestors.has(value)) {
        throw new TypeError(`${path} contains a cyclic reference.`);
    }

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const copy: JsonValue[] = [];
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.hasOwn(value, index)) {
                    throw new TypeError(`${path}[${index}] is a sparse array slot.`);
                }
                copy.push(cloneDeterministicJson(value[index], `${path}[${index}]`, ancestors));
            }
            return copy;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError(`${path} must contain only plain JSON objects.`);
        }

        const ownKeys = Reflect.ownKeys(value);
        if (ownKeys.some((key) => typeof key !== 'string')) {
            throw new TypeError(`${path} must not contain symbol keys.`);
        }

        const copy: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
        for (const key of (ownKeys as string[]).sort()) {
            assertDeterministicKey(key, path);
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor?.enumerable || !('value' in descriptor)) {
                throw new TypeError(`${path}.${key} must be an enumerable data property.`);
            }
            copy[key] = cloneDeterministicJson(descriptor.value, `${path}.${key}`, ancestors);
        }
        return copy;
    } finally {
        ancestors.delete(value);
    }
}

function serializeCanonical(value: JsonValue): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(serializeCanonical).join(',')}]`;
    }
    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serializeCanonical(value[key])}`)
        .join(',')}}`;
}

/**
 * Returns a detached JSON value whose object members were visited in sorted-key
 * order. Arrays retain their original order. The caller's value is never
 * mutated.
 */
export function deepSortJson(value: unknown): JsonValue {
    return cloneDeterministicJson(value, '$', new WeakSet<object>());
}

/** Serializes deterministic JSON with lexicographically sorted object keys. */
export function canonicalJson(value: unknown): string {
    return serializeCanonical(deepSortJson(value));
}

/** Returns the lowercase SHA-256 digest of canonical JSON content. */
export function sha256Digest(value: unknown): string {
    return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
