import type {
    ErrorResponse,
    NimiqProvider,
    SignatureResult
} from '@nimiq/mini-app-sdk/provider';

export type IdentityAdapterStatus =
    | 'unavailable'
    | 'initializing'
    | 'ready'
    | 'awaiting_approval'
    | 'authorized'
    | 'rejected'
    | 'timed_out'
    | 'failed';

export type IdentityAdapterOutcome<T> =
    | { status: 'ready' | 'authorized'; value: T }
    | { status: 'unavailable' | 'rejected' | 'timed_out' | 'failed'; message: string };

export type IdentitySignature = {
    publicKey: string;
    signature: string;
};

type MiniAppModule = typeof import('@nimiq/mini-app-sdk');
type ModuleLoader = () => Promise<MiniAppModule>;

const DEFAULT_INIT_TIMEOUT_MS = 5_000;
const DEFAULT_APPROVAL_TIMEOUT_MS = 60_000;

export class NimiqPayIdentityAdapter {
    private provider?: NimiqProvider;
    private module?: MiniAppModule;
    private status: IdentityAdapterStatus = 'unavailable';
    private readonly listeners = new Set<(status: IdentityAdapterStatus) => void>();

    public constructor(
        private readonly loadModule: ModuleLoader = () => import('@nimiq/mini-app-sdk'),
        private readonly initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
        private readonly approvalTimeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS
    ) {}

    public currentStatus(): IdentityAdapterStatus {
        return this.status;
    }

    public onStatus(listener: (status: IdentityAdapterStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public hostLanguage(): string {
        const context = window as Window & { nimiqPay?: { language?: unknown } };
        const host = context.nimiqPay?.language;
        if (typeof host === 'string' && /^[A-Za-z]{2}$/.test(host)) {
            return host.toLowerCase();
        }
        const device = navigator.language?.slice(0, 2);
        return device && /^[A-Za-z]{2}$/.test(device) ? device.toLowerCase() : 'en';
    }

    public async listAccounts(): Promise<IdentityAdapterOutcome<readonly string[]>> {
        const initialized = await this.initialize();
        if ('message' in initialized) return initialized;
        this.setStatus('awaiting_approval');
        walletBoundary();
        try {
            const raw = await withTimeout(
                initialized.value.listAccounts(),
                this.approvalTimeoutMs
            );
            if (isErrorResponse(raw)) return this.providerFailure(raw);
            if (!Array.isArray(raw) || raw.length === 0 || raw.length > 16 ||
                raw.some((address) => typeof address !== 'string' ||
                    address.length < 36 || address.length > 64 ||
                    !/^[A-Za-z0-9 ]+$/.test(address))) {
                return this.fail('failed', 'Nimiq Pay returned an invalid account list.');
            }
            this.setStatus('ready');
            return { status: 'ready', value: [...new Set(raw)] };
        } catch (error) {
            return this.thrownFailure(error, 'account approval');
        } finally {
            walletBoundary();
        }
    }

    public async sign(message: string): Promise<IdentityAdapterOutcome<IdentitySignature>> {
        if (!this.provider) {
            return this.fail('failed', 'Select a Nimiq account before signing.');
        }
        if (message.length < 64 || message.length > 1024 ||
            !/^[\x20-\x7E\n]+$/.test(message)) {
            return this.fail('failed', 'The server returned an invalid authorization message.');
        }
        this.setStatus('awaiting_approval');
        walletBoundary();
        try {
            const raw = await withTimeout(this.provider.sign(message), this.approvalTimeoutMs);
            if (isErrorResponse(raw)) return this.providerFailure(raw);
            if (!isSignatureResult(raw)) {
                return this.fail('failed', 'Nimiq Pay returned an invalid signature.');
            }
            this.setStatus('authorized');
            return {
                status: 'authorized',
                value: {
                    publicKey: raw.publicKey.toLowerCase(),
                    signature: raw.signature.toLowerCase()
                }
            };
        } catch (error) {
            return this.thrownFailure(error, 'signature approval');
        } finally {
            walletBoundary();
        }
    }

    public async requestDeviceIdentifier(
        reason: string
    ): Promise<IdentityAdapterOutcome<'received'>> {
        const initialized = await this.initialize();
        if ('message' in initialized) return initialized;
        if (!reason.trim()) {
            return this.fail('failed', 'A reason is required for optional device consent.');
        }
        this.setStatus('awaiting_approval');
        walletBoundary();
        try {
            const module = this.module!;
            const value = await withTimeout(
                module.requestDeviceIdentifier({ reason: reason.trim() }),
                this.approvalTimeoutMs
            );
            if (!/^[0-9a-fA-F]{64}$/.test(value)) {
                return this.fail('failed', 'Nimiq Pay returned an invalid device identifier.');
            }
            this.setStatus('ready');
            // Deliberately do not expose or persist the raw identifier.
            return { status: 'ready', value: 'received' };
        } catch (error) {
            return this.thrownFailure(error, 'device consent');
        } finally {
            walletBoundary();
        }
    }

    private async initialize(): Promise<IdentityAdapterOutcome<NimiqProvider>> {
        if (this.provider) return { status: 'ready', value: this.provider };
        this.setStatus('initializing');
        try {
            this.module = this.module || await this.loadModule();
            this.provider = await this.module.init({ timeout: this.initTimeoutMs });
            this.setStatus('ready');
            return { status: 'ready', value: this.provider };
        } catch {
            return this.fail(
                'unavailable',
                'Nimiq Pay is unavailable here. Practice remains available without a wallet.'
            );
        }
    }

    private providerFailure(error: ErrorResponse): IdentityAdapterOutcome<never> {
        const description = `${error.error.type} ${error.error.message}`.toLowerCase();
        if (/reject|denied|cancel/.test(description)) {
            return this.fail('rejected', 'The Nimiq Pay request was cancelled.');
        }
        return this.fail('failed', 'Nimiq Pay could not complete the request.');
    }

    private thrownFailure(error: unknown, action: string): IdentityAdapterOutcome<never> {
        if (error instanceof ApprovalTimeoutError) {
            return this.fail('timed_out', `Nimiq Pay ${action} timed out.`);
        }
        const description = error instanceof Error ? error.message.toLowerCase() : '';
        if (/reject|denied|cancel/.test(description)) {
            return this.fail('rejected', 'The Nimiq Pay request was cancelled.');
        }
        return this.fail('failed', `Nimiq Pay ${action} failed.`);
    }

    private fail<T extends 'unavailable' | 'rejected' | 'timed_out' | 'failed'>(
        status: T,
        message: string
    ): IdentityAdapterOutcome<never> {
        this.setStatus(status);
        return { status, message };
    }

    private setStatus(status: IdentityAdapterStatus): void {
        this.status = status;
        for (const listener of this.listeners) listener(status);
    }
}

class ApprovalTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = window.setTimeout(
            () => reject(new ApprovalTimeoutError()),
            milliseconds
        );
        void promise.then(
            (value) => {
                window.clearTimeout(timeout);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timeout);
                reject(error);
            }
        );
    });
}

function isErrorResponse(value: unknown): value is ErrorResponse {
    if (!value || typeof value !== 'object' || !('error' in value)) return false;
    const error = (value as { error?: unknown }).error;
    return Boolean(error && typeof error === 'object' &&
        typeof (error as { type?: unknown }).type === 'string' &&
        typeof (error as { message?: unknown }).message === 'string');
}

function isSignatureResult(value: unknown): value is SignatureResult {
    return Boolean(value && typeof value === 'object' &&
        typeof (value as { publicKey?: unknown }).publicKey === 'string' &&
        /^[0-9a-fA-F]{64}$/.test((value as { publicKey: string }).publicKey) &&
        typeof (value as { signature?: unknown }).signature === 'string' &&
        /^[0-9a-fA-F]{128}$/.test((value as { signature: string }).signature));
}

function walletBoundary(): void {
    window.dispatchEvent(new Event('nimble-knots:wallet-boundary'));
    window.dispatchEvent(new Event('resize'));
}
