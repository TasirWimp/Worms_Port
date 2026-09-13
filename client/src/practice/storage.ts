const ACTIVE_PRACTICE_KEY = 'nimble-knots.active-practice';

export type StoredPractice = {
    sessionId: string;
    challengeId: string;
};

export function readActivePractice(): StoredPractice | undefined {
    if (typeof sessionStorage === 'undefined') return undefined;
    try {
        const value = JSON.parse(sessionStorage.getItem(ACTIVE_PRACTICE_KEY) || 'null');
        return value && typeof value.sessionId === 'string' && typeof value.challengeId === 'string'
            ? value
            : undefined;
    } catch {
        sessionStorage.removeItem(ACTIVE_PRACTICE_KEY);
        return undefined;
    }
}

export function writeActivePractice(sessionId: string, challengeId: string): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(ACTIVE_PRACTICE_KEY, JSON.stringify({ sessionId, challengeId }));
}

export function clearActivePractice(): void {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ACTIVE_PRACTICE_KEY);
}
