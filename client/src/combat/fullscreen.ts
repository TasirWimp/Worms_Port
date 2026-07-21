export type FullscreenOutcome =
    | { status: 'entered' | 'exited' }
    | { status: 'unsupported' | 'rejected'; error?: unknown };

type FullscreenTarget = {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
};

type FullscreenDocument = {
    fullscreenEnabled: boolean;
    fullscreenElement: Element | null;
    documentElement: FullscreenTarget;
    exitFullscreen?: () => Promise<void>;
};

export function canRequestFullscreen(doc: FullscreenDocument = document): boolean {
    return doc.fullscreenEnabled &&
        typeof doc.documentElement.requestFullscreen === 'function' &&
        typeof doc.exitFullscreen === 'function';
}

export async function toggleGameFullscreen(
    doc: FullscreenDocument = document
): Promise<FullscreenOutcome> {
    if (!canRequestFullscreen(doc)) return { status: 'unsupported' };

    try {
        if (doc.fullscreenElement) {
            await doc.exitFullscreen!();
            return { status: 'exited' };
        }

        await doc.documentElement.requestFullscreen!({ navigationUI: 'hide' });
        return { status: 'entered' };
    } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        return {
            status: name === 'NotSupportedError' || error instanceof TypeError
                ? 'unsupported'
                : 'rejected',
            error
        };
    }
}
