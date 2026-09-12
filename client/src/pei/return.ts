export const PEI_RETURN_STORAGE_KEY = 'nimble-knots.pei-return-v0';

export type StoredPeiReturnV0 =
    | { kind: 'earn' | 'journey'; carrier: string }
    | { kind: 'cancel' };

export function capturePeiReturnV0(location: Location = window.location): void {
    const match = /^#pei-return\/(earn|journey)\/([A-Za-z0-9_-]{1,22000})$/.exec(location.hash);
    const cancelled = location.hash === '#pei-return/cancel';
    if (!match && !cancelled) return;
    const value: StoredPeiReturnV0 = match
        ? { kind: match[1] as 'earn' | 'journey', carrier: match[2] }
        : { kind: 'cancel' };
    sessionStorage.setItem(PEI_RETURN_STORAGE_KEY, JSON.stringify(value));
    history.replaceState(null, '', `${location.pathname}${location.search}`);
}

export function readPeiReturnV0(): StoredPeiReturnV0 | undefined {
    const raw = sessionStorage.getItem(PEI_RETURN_STORAGE_KEY);
    if (!raw) return undefined;
    try {
        const value = JSON.parse(raw) as Partial<StoredPeiReturnV0>;
        if (value.kind === 'cancel') return { kind: 'cancel' };
        if ((value.kind === 'earn' || value.kind === 'journey') &&
            typeof value.carrier === 'string' &&
            /^[A-Za-z0-9_-]{1,22000}$/.test(value.carrier)) {
            return { kind: value.kind, carrier: value.carrier };
        }
    } catch {
        // Invalid client storage is discarded below.
    }
    clearPeiReturnV0();
    return undefined;
}

export function clearPeiReturnV0(): void {
    sessionStorage.removeItem(PEI_RETURN_STORAGE_KEY);
}
