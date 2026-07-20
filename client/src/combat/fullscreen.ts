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

type OrientationController = {
    lock?: (orientation: 'landscape') => Promise<void>;
    unlock?: () => void;
};

export function canRequestFullscreen(doc: FullscreenDocument = document): boolean {
    return doc.fullscreenEnabled &&
        typeof doc.documentElement.requestFullscreen === 'function' &&
        typeof doc.exitFullscreen === 'function';
}

export async function toggleGameFullscreen(
    doc: FullscreenDocument = document,
    orientation: OrientationController = screen.orientation as OrientationController
): Promise<FullscreenOutcome> {
    if (!canRequestFullscreen(doc)) return { status: 'unsupported' };

    try {
        if (doc.fullscreenElement) {
            await doc.exitFullscreen!();
            try { orientation.unlock?.(); } catch {}
            return { status: 'exited' };
        }

        await doc.documentElement.requestFullscreen!({ navigationUI: 'hide' });
        try { await orientation.lock?.('landscape'); } catch {}
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
