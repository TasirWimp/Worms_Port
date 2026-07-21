export type SidewaysMode = 'left' | 'right';

export type ClientRectBounds = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

export function requestedSidewaysMode(search: string): SidewaysMode | null {
    const params = new URLSearchParams(search);
    if (!params.has('sideways')) return null;
    const value = params.get('sideways')?.toLowerCase();
    if (value === 'left' || value === 'counterclockwise' || value === 'ccw') return 'left';
    if (value === null || value === '' || value === '1' || value === 'right' ||
        value === 'clockwise' || value === 'cw') return 'right';
    return null;
}

export function resolveSidewaysMode(
    requested: SidewaysMode | null,
    viewportWidth: number,
    viewportHeight: number
): SidewaysMode | null {
    return requested && viewportHeight > viewportWidth ? requested : null;
}

export function activeSidewaysMode(
    root: Pick<HTMLElement, 'dataset'> = document.documentElement
): SidewaysMode | null {
    const value = root.dataset.sideways;
    return value === 'left' || value === 'right' ? value : null;
}

export function clientPointToGame(
    point: { x: number; y: number },
    bounds: ClientRectBounds,
    mode: SidewaysMode | null
): { x: number; y: number } {
    if (mode === 'right') {
        return { x: point.y - bounds.top, y: bounds.right - point.x };
    }
    if (mode === 'left') {
        return { x: bounds.bottom - point.y, y: point.x - bounds.left };
    }
    return point;
}
