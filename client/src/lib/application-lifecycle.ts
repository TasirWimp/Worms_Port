export const APP_SUSPEND_EVENT = 'nimble-knots:app-suspend';
export const APP_RESUME_EVENT = 'nimble-knots:app-resume';

export type LifecycleSocket = {
    readonly connected: boolean;
    connect(): unknown;
    disconnect(): unknown;
};

export type LifecycleGame = {
    readonly isPaused: boolean;
    pause(): void;
    resume(): void;
    stopLoop(): void;
    startLoop(): void;
};

type LifecycleDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> & {
    documentElement: Pick<HTMLElement, 'dataset'>;
};

type LifecycleWindow = Pick<Window,
    'addEventListener' | 'removeEventListener' | 'dispatchEvent'>;

export type ApplicationLifecycleOptions = {
    pageDocument?: LifecycleDocument;
    pageWindow?: LifecycleWindow;
    onResume?: () => void;
};

/**
 * Owns the browser process work that must stop when the mini app is hidden.
 * Match time and reward authority remain on the server; this class controls
 * only the local transport and presentation heartbeat.
 */
export class ApplicationLifecycle {
    private readonly pageDocument: LifecycleDocument;
    private readonly pageWindow: LifecycleWindow;
    private readonly onResume?: () => void;
    private socket?: LifecycleSocket;
    private game?: LifecycleGame;
    private suspended: boolean;
    private pausedAttachedGame = false;
    private disposed = false;

    public constructor(options: ApplicationLifecycleOptions = {}) {
        this.pageDocument = options.pageDocument ?? document;
        this.pageWindow = options.pageWindow ?? window;
        this.onResume = options.onResume;
        this.suspended = this.pageDocument.hidden;
        this.pageDocument.addEventListener('visibilitychange', this.onVisibilityChange);
        this.pageWindow.addEventListener('pagehide', this.onPageHide);
        this.pageWindow.addEventListener('pageshow', this.onPageShow);
        this.publishState();
    }

    public attachSocket(socket: LifecycleSocket): void {
        this.socket = socket;
        if (this.suspended) socket.disconnect();
    }

    public attachGame(game: LifecycleGame): void {
        this.game = game;
        if (this.suspended) {
            if (!game.isPaused) {
                this.pausedAttachedGame = true;
                game.pause();
            }
            game.stopLoop();
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.pageDocument.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.pageWindow.removeEventListener('pagehide', this.onPageHide);
        this.pageWindow.removeEventListener('pageshow', this.onPageShow);
    }

    private readonly onVisibilityChange = (): void => {
        if (this.pageDocument.hidden) this.suspend();
        else this.resume();
    };

    private readonly onPageHide = (): void => this.suspend();

    private readonly onPageShow = (): void => {
        if (!this.pageDocument.hidden) this.resume();
    };

    private suspend(): void {
        if (this.disposed || this.suspended) return;
        this.suspended = true;
        this.publishState();
        this.pageWindow.dispatchEvent(new Event(APP_SUSPEND_EVENT));
        if (this.game && !this.game.isPaused) {
            this.pausedAttachedGame = true;
            this.game.pause();
        }
        this.game?.stopLoop();
        // Calling disconnect while an automatic reconnect is pending also
        // disables that background reconnect until resume calls connect().
        this.socket?.disconnect();
    }

    private resume(): void {
        if (this.disposed || !this.suspended) return;
        this.suspended = false;
        this.publishState();
        this.socket?.connect();
        if (this.game && this.pausedAttachedGame) {
            this.pausedAttachedGame = false;
            this.game.resume();
        }
        this.onResume?.();
        this.pageWindow.dispatchEvent(new Event(APP_RESUME_EVENT));
        this.game?.startLoop();
    }

    private publishState(): void {
        this.pageDocument.documentElement.dataset.appLifecycle = this.suspended
            ? 'suspended'
            : 'active';
    }
}
