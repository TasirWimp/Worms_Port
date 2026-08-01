import { NimiqPayIdentityAdapter } from './adapter';
import { IdentityProtocolClient, IdentityProtocolError } from './client';
import type { WalletIdentity } from '../../../shared/protocol';

export const IDENTITY_SERVICES_REGISTRY_KEY = 'identity-services';

export type IdentityAcceptanceServices = {
    adapter: NimiqPayIdentityAdapter;
    protocol: IdentityProtocolClient;
};

export type IdentityAcceptanceOptions = {
    production?: boolean;
    onAuthorized?: (identity: WalletIdentity) => void;
};

export class IdentityAcceptanceView {
    public readonly root: HTMLElement;
    private disposed = false;
    private busy = false;
    private readonly unsubscribeStatus: () => void;

    public constructor(
        parent: HTMLElement,
        private readonly services: IdentityAcceptanceServices,
        private readonly onBusy: (busy: boolean) => void,
        private readonly options: IdentityAcceptanceOptions = {}
    ) {
        this.root = document.createElement('section');
        this.root.className = 'identity-acceptance';
        this.root.setAttribute('aria-labelledby', 'identity-acceptance-title');
        const production = options.production === true;
        this.root.innerHTML = `
            <h2 id="identity-acceptance-title">${
                production ? 'Authorize your reward wallet' : 'Nimiq Pay identity test'
            }</h2>
            <p>${
                production
                    ? 'Choose the account that should receive a fixed reward after an eligible server-verified win. Practice never needs a wallet.'
                    : 'This query-only surface verifies wallet identity. Practice never needs it.'
            }</p>
            <p class="identity-language">Host language: <strong>${services.adapter.hostLanguage()}</strong></p>
            <div class="identity-actions">
                <button type="button" data-identity-action="accounts">Choose Nimiq account</button>
                ${production ? '' : '<button type="button" data-identity-action="device">Test optional device consent</button>'}
            </div>
            <div class="identity-accounts" aria-label="Available Nimiq accounts"></div>
            <p class="identity-message" aria-live="polite">Wallet access has not been requested.</p>
        `;
        parent.appendChild(this.root);
        this.root.querySelector('[data-identity-action="accounts"]')?.addEventListener(
            'click',
            () => void this.loadAccounts()
        );
        this.root.querySelector('[data-identity-action="device"]')?.addEventListener(
            'click',
            () => void this.requestDeviceConsent()
        );
        this.unsubscribeStatus = services.adapter.onStatus((status) => {
            this.root.dataset.identityStatus = status;
        });
        this.root.dataset.identityStatus = services.adapter.currentStatus();
    }

    public destroy(): void {
        this.disposed = true;
        this.unsubscribeStatus();
        this.setBusy(false);
        this.root.remove();
    }

    private async loadAccounts(): Promise<void> {
        if (this.busy) return;
        this.setBusy(true);
        this.setMessage('Waiting for Nimiq Pay account approval...');
        try {
            const outcome = await this.services.adapter.listAccounts();
            if ('message' in outcome) {
                this.setMessage(outcome.message);
                return;
            }
            const list = this.root.querySelector('.identity-accounts') as HTMLElement;
            list.replaceChildren();
            for (const address of outcome.value) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'identity-account';
                button.textContent = address;
                button.addEventListener('click', () => void this.authorize(address));
                list.appendChild(button);
            }
            this.setMessage('Choose the account that should authorize this session.');
        } finally {
            this.setBusy(false);
        }
    }

    private async authorize(address: string): Promise<void> {
        if (this.busy) return;
        this.setBusy(true);
        this.setMessage('Preparing a short-lived server authorization...');
        let pendingAuthorizationId: string | undefined;
        try {
            const authorization = await this.services.protocol.begin(address);
            pendingAuthorizationId = authorization.authorizationId;
            this.setMessage('Review and approve the readable sign-in message in Nimiq Pay.');
            const signed = await this.services.adapter.sign(authorization.message);
            if ('message' in signed) {
                this.setMessage(signed.message);
                return;
            }
            const completed = await this.services.protocol.complete(authorization, signed.value);
            pendingAuthorizationId = undefined;
            this.root.dataset.authorized = 'true';
            this.setMessage(`Authorized as ${completed.identity.address}.`);
            if (!this.disposed) this.options.onAuthorized?.(completed.identity);
        } catch (error) {
            this.setMessage(identityErrorMessage(error));
        } finally {
            if (pendingAuthorizationId) {
                try {
                    await this.services.protocol.cancel(pendingAuthorizationId);
                } catch {
                    // Best-effort cleanup; expiry and disconnect remain safe fallbacks.
                }
            }
            this.setBusy(false);
        }
    }

    private async requestDeviceConsent(): Promise<void> {
        if (this.busy) return;
        this.setBusy(true);
        this.setMessage('Waiting for optional device consent...');
        try {
            const result = await this.services.adapter.requestDeviceIdentifier(
                'Help NIMble Knots evaluate future reward-abuse protection.'
            );
            this.setMessage('Device consent succeeded. The identifier was not displayed, stored, or used to sign in.');
            if ('message' in result) this.setMessage(result.message);
        } finally {
            this.setBusy(false);
        }
    }

    private setBusy(busy: boolean): void {
        this.busy = busy;
        if (this.disposed) return;
        for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) {
            button.disabled = busy;
        }
        this.onBusy(busy);
    }

    private setMessage(message: string): void {
        if (this.disposed) return;
        const field = this.root.querySelector('.identity-message') as HTMLElement;
        field.textContent = message;
    }
}

function identityErrorMessage(error: unknown): string {
    if (error instanceof IdentityProtocolError) return error.message;
    return 'Identity authorization could not be completed. Practice remains available.';
}
